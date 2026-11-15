import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '../../generated/prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';

const TEAM_MANAGER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  isActive: true,
} satisfies Prisma.UserSelect;

const TEAM_MEMBER_USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  role: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(companyId: string) {
    const teams = await this.prisma.team.findMany({
      where: { companyId },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        manager: { select: TEAM_MANAGER_SELECT },
        _count: {
          select: {
            members: { where: { user: { isActive: true } } },
          },
        },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });

    return teams.map(({ _count, manager, ...team }) => ({
      ...team,
      manager: manager?.isActive
        ? {
            id: manager.id,
            firstName: manager.firstName,
            lastName: manager.lastName,
            email: manager.email,
          }
        : null,
      membersCount: _count.members,
    }));
  }

  async findOne(companyId: string, id: string) {
    const team = await this.prisma.team.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        name: true,
        description: true,
        manager: { select: TEAM_MANAGER_SELECT },
        members: {
          where: { user: { isActive: true } },
          select: {
            joinedAt: true,
            user: { select: TEAM_MEMBER_USER_SELECT },
          },
          orderBy: [{ joinedAt: 'asc' }, { userId: 'asc' }],
        },
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!team) throw new NotFoundException('Team not found');
    return {
      ...team,
      manager: team.manager?.isActive
        ? {
            id: team.manager.id,
            firstName: team.manager.firstName,
            lastName: team.manager.lastName,
            email: team.manager.email,
          }
        : null,
    };
  }

  async create(actor: AuthUser, dto: CreateTeamDto) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        if (dto.managerId) {
          await this.findManager(transaction, actor.companyId, dto.managerId);
        }
        return transaction.team.create({
          data: {
            companyId: actor.companyId,
            name: dto.name.trim(),
            description: dto.description?.trim() || null,
            managerId: dto.managerId,
            ...(dto.managerId && {
              members: { create: { userId: dto.managerId } },
            }),
          },
          select: { id: true, name: true, description: true, managerId: true },
        });
      });
    } catch (error) {
      this.throwForDuplicateTeamName(error);
    }
  }

  async update(actor: AuthUser, id: string, dto: UpdateTeamDto) {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException('At least one field must be provided');
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const team = await transaction.team.findFirst({
          where: { id, companyId: actor.companyId },
          select: { id: true },
        });
        if (!team) throw new NotFoundException('Team not found');

        if (dto.managerId) {
          await this.findManager(transaction, actor.companyId, dto.managerId);
        }

        const updated = await transaction.team.update({
          where: { id },
          data: {
            ...(dto.name !== undefined && { name: dto.name.trim() }),
            ...(dto.description !== undefined && {
              description: dto.description?.trim() || null,
            }),
            ...(dto.managerId !== undefined && { managerId: dto.managerId }),
          },
          select: { id: true, name: true, description: true, managerId: true },
        });

        if (dto.managerId) {
          await transaction.teamMember.upsert({
            where: { teamId_userId: { teamId: id, userId: dto.managerId } },
            create: { teamId: id, userId: dto.managerId },
            update: {},
          });
        }
        return updated;
      });
    } catch (error) {
      this.throwForDuplicateTeamName(error);
    }
  }

  async remove(companyId: string, id: string) {
    const team = await this.prisma.team.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!team) throw new NotFoundException('Team not found');
    await this.prisma.team.delete({ where: { id } });
    return { status: 'ok' };
  }

  async addMember(actor: AuthUser, teamId: string, userId: string) {
    const team = await this.findTeamForMemberAction(actor, teamId);
    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyId: actor.companyId, isActive: true },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.teamMember.upsert({
      where: { teamId_userId: { teamId: team.id, userId } },
      create: { teamId, userId },
      update: {},
      select: {
        teamId: true,
        userId: true,
        joinedAt: true,
        user: { select: TEAM_MEMBER_USER_SELECT },
      },
    });
  }

  async removeMember(actor: AuthUser, teamId: string, userId: string) {
    const team = await this.findTeamForMemberAction(actor, teamId);
    if (team.managerId === userId) {
      throw new BadRequestException('The team manager must remain a member');
    }
    const membership = await this.prisma.teamMember.deleteMany({
      where: { teamId: team.id, userId },
    });
    if (membership.count === 0) {
      throw new NotFoundException('Team member not found');
    }
    return { status: 'ok' };
  }

  private async findTeamForMemberAction(actor: AuthUser, id: string) {
    const team = await this.prisma.team.findFirst({
      where: { id, companyId: actor.companyId },
      select: { id: true, managerId: true },
    });
    if (!team) throw new NotFoundException('Team not found');
    if (actor.role === UserRole.MANAGER && team.managerId !== actor.id) {
      throw new ForbiddenException();
    }
    return team;
  }

  private async findManager(
    transaction: Prisma.TransactionClient,
    companyId: string,
    managerId: string,
  ) {
    const manager = await transaction.user.findFirst({
      where: {
        id: managerId,
        companyId,
        isActive: true,
        role: { in: [UserRole.MANAGER, UserRole.COMPANY_ADMIN] },
      },
      select: { id: true },
    });
    if (!manager) throw new NotFoundException('Manager not found');
    return manager;
  }

  private throwForDuplicateTeamName(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('A team with this name already exists');
    }
    throw error;
  }
}
