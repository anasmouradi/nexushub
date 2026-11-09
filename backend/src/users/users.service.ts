import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '../../generated/prisma/client';
import { randomBytes, createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { ListUsersDto } from './dto/list-users.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const USER_SELECT = {
  id: true,
  email: true,
  companyId: true,
  firstName: true,
  lastName: true,
  role: true,
  isActive: true,
} satisfies Prisma.UserSelect;

const INVITATION_SELECT = {
  id: true,
  email: true,
  role: true,
  expiresAt: true,
  createdAt: true,
} satisfies Prisma.InvitationSelect;

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findMany(companyId: string, query: ListUsersDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = { companyId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: USER_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data, page, limit, total };
  }

  async findOne(companyId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, companyId },
      select: USER_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateOne(
    companyId: string,
    id: string,
    requesterId: string,
    dto: UpdateUserDto | UpdateProfileDto,
  ) {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException('At least one field must be provided');
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT "id" FROM "companies" WHERE "id" = ${companyId} FOR UPDATE`;
        const existing = await transaction.user.findFirst({
          where: { id, companyId },
          select: { id: true, role: true, isActive: true },
        });
        if (!existing) throw new NotFoundException('User not found');

        if (
          id === requesterId &&
          ((dto instanceof UpdateUserDto &&
            dto.role !== undefined &&
            dto.role !== UserRole.COMPANY_ADMIN) ||
            ('isActive' in dto && dto.isActive === false))
        ) {
          throw new BadRequestException(
            'You cannot remove your own administrator role or deactivate yourself',
          );
        }

        if (dto instanceof UpdateUserDto && dto.role === UserRole.SUPER_ADMIN) {
          throw new BadRequestException('SUPER_ADMIN cannot be assigned');
        }

        const isDemotingActiveAdmin =
          existing.role === UserRole.COMPANY_ADMIN &&
          existing.isActive &&
          ((dto instanceof UpdateUserDto &&
            dto.role !== undefined &&
            dto.role !== UserRole.COMPANY_ADMIN) ||
            ('isActive' in dto && dto.isActive === false));
        if (isDemotingActiveAdmin) {
          const activeAdmins = await transaction.user.count({
            where: { companyId, role: UserRole.COMPANY_ADMIN, isActive: true },
          });
          if (activeAdmins <= 1) {
            throw new BadRequestException(
              'The last active company administrator cannot be demoted or deactivated',
            );
          }
        }

        const updated = await transaction.user.update({
          where: { id },
          data: {
            ...(dto.email !== undefined && { email: dto.email }),
            ...(dto.firstName !== undefined && {
              firstName: dto.firstName.trim(),
            }),
            ...(dto.lastName !== undefined && {
              lastName: dto.lastName.trim(),
            }),
            ...(dto instanceof UpdateUserDto &&
              dto.role !== undefined && { role: dto.role }),
            ...(dto instanceof UpdateUserDto &&
              dto.isActive !== undefined && { isActive: dto.isActive }),
          },
          select: USER_SELECT,
        });

        if (updated.isActive === false) {
          await transaction.refreshToken.updateMany({
            where: { userId: id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
        return updated;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }
      throw error;
    }
  }

  async remove(companyId: string, id: string, requesterId: string) {
    const dto = Object.assign(new UpdateUserDto(), { isActive: false });
    return this.updateOne(companyId, id, requesterId, dto);
  }

  async createInvitation(
    companyId: string,
    invitedById: string,
    dto: CreateInvitationDto,
  ) {
    if (dto.role === UserRole.SUPER_ADMIN) {
      throw new BadRequestException('SUPER_ADMIN cannot be assigned');
    }

    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    try {
      const invitation = await this.prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT "id" FROM "companies" WHERE "id" = ${companyId} FOR UPDATE`;
        await transaction.$queryRaw`WITH email_lock AS (SELECT pg_advisory_xact_lock(hashtextextended(${dto.email}, 0))) SELECT 1 AS locked FROM email_lock`;
        const existingUser = await transaction.user.findUnique({
          where: { email: dto.email },
          select: { id: true },
        });
        if (existingUser) {
          throw new ConflictException(
            'An account with this email already exists',
          );
        }

        const pendingInvitation = await transaction.invitation.findFirst({
          where: {
            email: dto.email,
            acceptedAt: null,
            expiresAt: { gt: now },
          },
          select: { id: true },
        });
        if (pendingInvitation) {
          throw new ConflictException(
            'An active invitation already exists for this email',
          );
        }

        return transaction.invitation.create({
          data: {
            companyId,
            invitedById,
            email: dto.email,
            role: dto.role,
            tokenHash: this.hashToken(token),
            expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
          },
          select: INVITATION_SELECT,
        });
      });

      this.logger.log(
        `Invitation link: http://localhost:3000/accept-invite?token=${encodeURIComponent(token)}`,
      );
      return invitation;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'An active invitation already exists for this email',
        );
      }
      throw error;
    }
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
