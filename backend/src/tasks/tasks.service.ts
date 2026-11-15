import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  ProjectStatus,
  TaskStatus,
  UserRole,
} from '../../generated/prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { ProjectAccessService } from '../projects/project-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { ListTasksDto } from './dto/list-tasks.dto';
import { MoveTaskDto } from './dto/move-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

const TASK_SELECT = {
  id: true,
  projectId: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  position: true,
  assigneeId: true,
  dueDate: true,
  estimatedHours: true,
  actualHours: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  assignee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
    },
  },
  creator: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  project: { select: { id: true, name: true } },
} satisfies Prisma.TaskSelect;

const TASK_ACCESS_SELECT = {
  id: true,
  companyId: true,
  projectId: true,
  status: true,
  position: true,
  assigneeId: true,
  completedAt: true,
  project: {
    select: {
      managerId: true,
      status: true,
    },
  },
} satisfies Prisma.TaskSelect;

type AccessibleTask = Prisma.TaskGetPayload<{
  select: typeof TASK_ACCESS_SELECT;
}>;

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  async findProjectTasks(
    actor: AuthUser,
    projectId: string,
    query: ListTasksDto,
  ) {
    await this.findVisibleProject(actor, projectId);
    return this.prisma.task.findMany({
      where: {
        companyId: actor.companyId,
        projectId,
        ...(query.priority && { priority: query.priority }),
        ...(query.assigneeId && { assigneeId: query.assigneeId }),
        ...this.statusWhere(query.status, query.overdue),
        ...this.overdueWhere(query.overdue),
      },
      select: TASK_SELECT,
      orderBy: [{ status: 'asc' }, { position: 'asc' }, { id: 'asc' }],
    });
  }

  async findMyTasks(actor: AuthUser, query: ListTasksDto) {
    return this.prisma.task.findMany({
      where: {
        companyId: actor.companyId,
        project: this.projectAccess.visibleWhere(actor),
        assigneeId: query.assigneeId ?? actor.id,
        ...(query.priority && { priority: query.priority }),
        ...this.statusWhere(query.status, query.overdue),
        ...this.overdueWhere(query.overdue),
      },
      select: TASK_SELECT,
      orderBy: [
        { dueDate: { sort: 'asc', nulls: 'last' } },
        { createdAt: 'desc' },
        { id: 'asc' },
      ],
    });
  }

  async findOne(actor: AuthUser, id: string) {
    const task = await this.prisma.task.findFirst({
      where: {
        id,
        companyId: actor.companyId,
        project: this.projectAccess.visibleWhere(actor),
      },
      select: TASK_SELECT,
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  async create(actor: AuthUser, projectId: string, dto: CreateTaskDto) {
    return this.prisma.$transaction(async (transaction) => {
      const project = await transaction.project.findFirst({
        where: {
          id: projectId,
          ...this.projectAccess.visibleWhere(actor),
        },
        select: { id: true, companyId: true, managerId: true, status: true },
      });
      if (!project) throw new NotFoundException('Project not found');
      this.assertCanManageProject(actor, project.managerId);
      if (
        project.status === ProjectStatus.COMPLETED ||
        project.status === ProjectStatus.CANCELLED
      ) {
        throw new BadRequestException(
          'Cannot create tasks for a completed or cancelled project',
        );
      }

      if (dto.assigneeId) {
        await this.validateAssignee(
          transaction,
          project.companyId,
          project.id,
          dto.assigneeId,
        );
      }

      const lastTask = await transaction.task.findFirst({
        where: { projectId: project.id, status: dto.status ?? TaskStatus.TODO },
        select: { position: true },
        orderBy: [{ position: 'desc' }, { id: 'desc' }],
      });
      return transaction.task.create({
        data: {
          companyId: project.companyId,
          projectId: project.id,
          title: dto.title,
          description: dto.description || null,
          status: dto.status,
          priority: dto.priority,
          position: lastTask ? lastTask.position + 1000 : 0,
          assigneeId: dto.assigneeId,
          creatorId: actor.id,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          estimatedHours: dto.estimatedHours,
          completedAt: dto.status === TaskStatus.DONE ? new Date() : undefined,
        },
        select: TASK_SELECT,
      });
    });
  }

  async update(actor: AuthUser, id: string, dto: UpdateTaskDto) {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException('At least one field must be provided');
    }

    const task = await this.findAccessible(actor, id);
    this.assertCanModifyTask(actor, task);
    if (actor.role === UserRole.EMPLOYEE) {
      const forbiddenFields = Object.entries(dto)
        .filter(([, value]) => value !== undefined)
        .map(([field]) => field)
        .filter(
          (field) => !['status', 'actualHours', 'description'].includes(field),
        );
      if (forbiddenFields.length > 0) throw new ForbiddenException();
    }

    if (dto.assigneeId) {
      await this.validateAssignee(
        this.prisma,
        task.companyId,
        task.projectId,
        dto.assigneeId,
      );
    }

    const status = dto.status ?? task.status;
    return this.prisma.task.update({
      where: { id: task.id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && {
          description: dto.description || null,
        }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.assigneeId !== undefined && { assigneeId: dto.assigneeId }),
        ...(dto.dueDate !== undefined && {
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        }),
        ...(dto.estimatedHours !== undefined && {
          estimatedHours: dto.estimatedHours,
        }),
        ...(dto.actualHours !== undefined && {
          actualHours: dto.actualHours,
        }),
        completedAt:
          status === TaskStatus.DONE ? (task.completedAt ?? new Date()) : null,
      },
      select: TASK_SELECT,
    });
  }

  async move(actor: AuthUser, id: string, dto: MoveTaskDto) {
    const task = await this.findAccessible(actor, id);
    this.assertCanModifyTask(actor, task);
    if (dto.beforeId === task.id || dto.afterId === task.id) {
      throw new BadRequestException('A task cannot be its own move anchor');
    }
    if (dto.beforeId && dto.beforeId === dto.afterId) {
      throw new BadRequestException('Move anchors must be different tasks');
    }

    return this.prisma.$transaction(async (transaction) => {
      const [before, after] = await Promise.all([
        dto.beforeId
          ? transaction.task.findFirst({
              where: {
                id: dto.beforeId,
                companyId: task.companyId,
                projectId: task.projectId,
                status: dto.status,
              },
              select: { position: true },
            })
          : null,
        dto.afterId
          ? transaction.task.findFirst({
              where: {
                id: dto.afterId,
                companyId: task.companyId,
                projectId: task.projectId,
                status: dto.status,
              },
              select: { position: true },
            })
          : null,
      ]);

      if ((dto.beforeId && !before) || (dto.afterId && !after)) {
        throw new BadRequestException(
          'Move anchors must belong to this project and target column',
        );
      }
      if (before && after && before.position >= after.position) {
        throw new BadRequestException('Move anchors are not in column order');
      }
      if (!before && !after) {
        const remainingInColumn = await transaction.task.count({
          where: {
            companyId: task.companyId,
            projectId: task.projectId,
            status: dto.status,
            id: { not: task.id },
          },
        });
        if (remainingInColumn > 0) {
          throw new BadRequestException(
            'Move anchors are required for a non-empty column',
          );
        }
      }

      let position: number;
      if (before && after) position = (before.position + after.position) / 2;
      else if (before) position = before.position + 1000;
      else if (after) position = after.position - 1000;
      else position = 0;

      return transaction.task.update({
        where: { id: task.id },
        data: {
          status: dto.status,
          position,
          completedAt:
            dto.status === TaskStatus.DONE
              ? (task.completedAt ?? new Date())
              : null,
        },
        select: TASK_SELECT,
      });
    });
  }

  async remove(actor: AuthUser, id: string) {
    const task = await this.findAccessible(actor, id);
    this.assertCanManageProject(actor, task.project.managerId);
    await this.prisma.task.delete({ where: { id: task.id } });
    return { status: 'ok' };
  }

  private statusWhere(
    status?: TaskStatus,
    overdue?: boolean,
  ): Prisma.TaskWhereInput {
    if (status && overdue) {
      return { status: { equals: status, not: TaskStatus.DONE } };
    }
    if (status) return { status };
    return overdue ? { status: { not: TaskStatus.DONE } } : {};
  }

  private overdueWhere(overdue?: boolean): Prisma.TaskWhereInput {
    return overdue ? { dueDate: { lt: new Date() } } : {};
  }

  private async findVisibleProject(actor: AuthUser, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, ...this.projectAccess.visibleWhere(actor) },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  private async findAccessible(
    actor: AuthUser,
    id: string,
  ): Promise<AccessibleTask> {
    const task = await this.prisma.task.findFirst({
      where: {
        id,
        companyId: actor.companyId,
        project: this.projectAccess.visibleWhere(actor),
      },
      select: TASK_ACCESS_SELECT,
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  private assertCanManageProject(actor: AuthUser, managerId: string | null) {
    if (
      actor.role !== UserRole.COMPANY_ADMIN &&
      !(actor.role === UserRole.MANAGER && managerId === actor.id)
    ) {
      throw new ForbiddenException();
    }
  }

  private assertCanModifyTask(actor: AuthUser, task: AccessibleTask) {
    if (
      actor.role === UserRole.COMPANY_ADMIN ||
      (actor.role === UserRole.MANAGER && task.project.managerId === actor.id)
    ) {
      return;
    }
    if (actor.role === UserRole.EMPLOYEE && task.assigneeId === actor.id) {
      return;
    }
    throw new ForbiddenException();
  }

  private async validateAssignee(
    prisma: Prisma.TransactionClient | PrismaService,
    companyId: string,
    projectId: string,
    assigneeId: string,
  ) {
    const user = await prisma.user.findFirst({
      where: { id: assigneeId, companyId, isActive: true },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Assignee not found');

    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: assigneeId } },
      select: { userId: true },
    });
    if (!membership) {
      throw new BadRequestException('Assignee must be a project member');
    }
  }
}
