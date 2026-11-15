import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '../../generated/prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectAccessService } from './project-access.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { ListProjectsDto } from './dto/list-projects.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

const PERSON_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  isActive: true,
} satisfies Prisma.UserSelect;

const PROJECT_MEMBER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  role: true,
} satisfies Prisma.UserSelect;

const PROJECT_SELECT = {
  id: true,
  name: true,
  description: true,
  status: true,
  priority: true,
  startDate: true,
  dueDate: true,
  manager: { select: PERSON_SELECT },
  team: { select: { id: true, name: true } },
  createdBy: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  _count: {
    select: {
      members: { where: { user: { isActive: true } } },
    },
  },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProjectSelect;

type ProjectSummaryRecord = Prisma.ProjectGetPayload<{
  select: typeof PROJECT_SELECT;
}>;

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  async findMany(actor: AuthUser, query: ListProjectsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.ProjectWhereInput = {
      ...this.projectAccess.visibleWhere(actor),
      ...(query.status && { status: query.status }),
      ...(query.priority && { priority: query.priority }),
      ...(query.teamId && { teamId: query.teamId }),
      ...(query.search && {
        name: { contains: query.search.trim(), mode: 'insensitive' },
      }),
    };

    const [projects, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        select: PROJECT_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.project.count({ where }),
    ]);

    return {
      data: projects.map((project) => this.toSummary(project)),
      page,
      limit,
      total,
    };
  }

  async findOne(actor: AuthUser, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, ...this.projectAccess.visibleWhere(actor) },
      select: {
        ...PROJECT_SELECT,
        members: {
          where: { user: { isActive: true } },
          select: {
            addedAt: true,
            user: { select: PROJECT_MEMBER_SELECT },
          },
          orderBy: [{ addedAt: 'asc' }, { userId: 'asc' }],
        },
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    return {
      ...this.toSummary(project),
      members: project.members.map(({ addedAt, user }) => ({
        addedAt,
        user,
      })),
    };
  }

  async create(actor: AuthUser, dto: CreateProjectDto) {
    this.validateDates(dto.startDate, dto.dueDate);
    const managerId =
      dto.managerId ?? (actor.role === UserRole.MANAGER ? actor.id : undefined);

    return this.prisma.$transaction(async (transaction) => {
      if (managerId) {
        await this.findManager(transaction, actor.companyId, managerId);
      }

      let teamMemberIds: string[] = [];
      if (dto.teamId) {
        await this.findTeam(transaction, actor.companyId, dto.teamId);
        if (dto.addTeamMembers) {
          teamMemberIds = await this.findActiveTeamMemberIds(
            transaction,
            dto.teamId,
          );
        }
      } else if (dto.addTeamMembers) {
        throw new BadRequestException(
          'A team must be selected to add its members',
        );
      }

      const memberIds = [
        ...new Set([...(managerId ? [managerId] : []), ...teamMemberIds]),
      ];
      const project = await transaction.project.create({
        data: {
          companyId: actor.companyId,
          name: dto.name,
          description: dto.description || null,
          status: dto.status,
          priority: dto.priority,
          startDate: dto.startDate ? new Date(dto.startDate) : null,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          managerId,
          teamId: dto.teamId,
          createdById: actor.id,
          ...(memberIds.length > 0 && {
            members: { create: memberIds.map((userId) => ({ userId })) },
          }),
        },
        select: PROJECT_SELECT,
      });
      return this.toSummary(project);
    });
  }

  async update(actor: AuthUser, id: string, dto: UpdateProjectDto) {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException('At least one field must be provided');
    }

    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.project.findFirst({
        where: { id, companyId: actor.companyId },
        select: {
          id: true,
          managerId: true,
          teamId: true,
          startDate: true,
          dueDate: true,
        },
      });
      if (!existing) throw new NotFoundException('Project not found');
      if (actor.role === UserRole.MANAGER && existing.managerId !== actor.id) {
        throw new ForbiddenException();
      }

      const startDate =
        dto.startDate === undefined
          ? existing.startDate
          : dto.startDate
            ? new Date(dto.startDate)
            : null;
      const dueDate =
        dto.dueDate === undefined
          ? existing.dueDate
          : dto.dueDate
            ? new Date(dto.dueDate)
            : null;
      this.validateDates(startDate, dueDate);

      if (dto.managerId) {
        await this.findManager(transaction, actor.companyId, dto.managerId);
      }
      const teamId = dto.teamId === undefined ? existing.teamId : dto.teamId;
      if (teamId) await this.findTeam(transaction, actor.companyId, teamId);
      if (dto.addTeamMembers && !teamId) {
        throw new BadRequestException(
          'A team must be selected to add its members',
        );
      }

      const updated = await transaction.project.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && {
            description: dto.description || null,
          }),
          ...(dto.status !== undefined && { status: dto.status }),
          ...(dto.priority !== undefined && { priority: dto.priority }),
          ...(dto.startDate !== undefined && { startDate }),
          ...(dto.dueDate !== undefined && { dueDate }),
          ...(dto.managerId !== undefined && { managerId: dto.managerId }),
          ...(dto.teamId !== undefined && { teamId: dto.teamId }),
        },
        select: PROJECT_SELECT,
      });

      if (dto.managerId) {
        await transaction.projectMember.upsert({
          where: { projectId_userId: { projectId: id, userId: dto.managerId } },
          create: { projectId: id, userId: dto.managerId },
          update: {},
        });
      }
      if (dto.addTeamMembers && teamId) {
        const memberIds = await this.findActiveTeamMemberIds(
          transaction,
          teamId,
        );
        if (memberIds.length > 0) {
          await transaction.projectMember.createMany({
            data: memberIds.map((userId) => ({ projectId: id, userId })),
            skipDuplicates: true,
          });
        }
      }
      return this.toSummary(updated);
    });
  }

  async remove(actor: AuthUser, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, companyId: actor.companyId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    await this.prisma.project.delete({ where: { id } });
    return { status: 'ok' };
  }

  async addMember(actor: AuthUser, projectId: string, userId: string) {
    const project = await this.findProjectForMemberAction(actor, projectId);
    const user = await this.findActiveUser(
      this.prisma,
      actor.companyId,
      userId,
    );
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: project.id, userId } },
      create: { projectId, userId },
      update: {},
      select: {
        projectId: true,
        userId: true,
        addedAt: true,
        user: { select: PROJECT_MEMBER_SELECT },
      },
    });
  }

  async removeMember(actor: AuthUser, projectId: string, userId: string) {
    const project = await this.findProjectForMemberAction(actor, projectId);
    if (project.managerId === userId) {
      throw new BadRequestException('The project manager must remain a member');
    }
    const membership = await this.prisma.projectMember.deleteMany({
      where: { projectId: project.id, userId },
    });
    if (membership.count === 0) {
      throw new NotFoundException('Project member not found');
    }
    return { status: 'ok' };
  }

  private toSummary(project: ProjectSummaryRecord) {
    const { _count, manager, ...data } = project;
    return {
      ...data,
      manager: manager?.isActive
        ? {
            id: manager.id,
            firstName: manager.firstName,
            lastName: manager.lastName,
            email: manager.email,
          }
        : null,
      membersCount: _count.members,
    };
  }

  private validateDates(
    startDate: string | Date | null | undefined,
    dueDate: string | Date | null | undefined,
  ) {
    if (startDate && dueDate && new Date(dueDate) < new Date(startDate)) {
      throw new BadRequestException('dueDate must be on or after startDate');
    }
  }

  private async findProjectForMemberAction(actor: AuthUser, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, companyId: actor.companyId },
      select: { id: true, managerId: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    if (actor.role === UserRole.MANAGER && project.managerId !== actor.id) {
      throw new ForbiddenException();
    }
    return project;
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

  private async findTeam(
    transaction: Prisma.TransactionClient,
    companyId: string,
    teamId: string,
  ) {
    const team = await transaction.team.findFirst({
      where: { id: teamId, companyId },
      select: { id: true },
    });
    if (!team) throw new NotFoundException('Team not found');
    return team;
  }

  private async findActiveTeamMemberIds(
    transaction: Prisma.TransactionClient,
    teamId: string,
  ) {
    const members = await transaction.teamMember.findMany({
      where: { teamId, user: { isActive: true } },
      select: { userId: true },
    });
    return members.map((member) => member.userId);
  }

  private findActiveUser(
    prisma: PrismaService,
    companyId: string,
    userId: string,
  ) {
    return prisma.user.findFirst({
      where: { id: userId, companyId, isActive: true },
      select: { id: true },
    });
  }
}
