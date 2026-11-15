import { Injectable } from '@nestjs/common';
import {
  Priority,
  ProjectStatus,
  Prisma,
  TaskStatus,
  UserRole,
} from '../../generated/prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { ProjectAccessService } from '../projects/project-access.service';
import { PrismaService } from '../prisma/prisma.service';

const PROJECT_STATUSES = Object.values(ProjectStatus);
const TASK_STATUSES = Object.values(TaskStatus);
const PRIORITIES = Object.values(Priority);

type CountRow<T extends string> = { key: T; count: number };

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  async getDashboard(actor: AuthUser) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const firstActivityMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1),
    );
    const monthKeys = Array.from({ length: 6 }, (_, index) => {
      const month = new Date(
        Date.UTC(
          firstActivityMonth.getUTCFullYear(),
          firstActivityMonth.getUTCMonth() + index,
          1,
        ),
      );
      return month.toISOString().slice(0, 7);
    });
    const activityByMonth = new Map(
      monthKeys.map((month) => [month, { month, created: 0, completed: 0 }]),
    );

    const projectScope: Prisma.ProjectWhereInput = {
      companyId: actor.companyId,
      ...this.projectAccess.visibleWhere(actor),
    };
    const taskScope: Prisma.TaskWhereInput = {
      companyId: actor.companyId,
      project: this.projectAccess.visibleWhere(actor),
      ...(actor.role === UserRole.EMPLOYEE && { assigneeId: actor.id }),
    };

    const [
      totalProjects,
      activeProjects,
      completedProjects,
      employees,
      totalTasks,
      overdueTasks,
      projectStatusGroups,
      taskStatusGroups,
      taskPriorityGroups,
      recentlyCompletedTasks,
      openTasksByTeam,
      activityTasks,
    ] = await Promise.all([
      this.prisma.project.count({ where: projectScope }),
      this.prisma.project.count({
        where: { ...projectScope, status: ProjectStatus.IN_PROGRESS },
      }),
      this.prisma.project.count({
        where: { ...projectScope, status: ProjectStatus.COMPLETED },
      }),
      actor.role === UserRole.EMPLOYEE
        ? Promise.resolve(null)
        : this.prisma.user.count({
            where: {
              companyId: actor.companyId,
              isActive: true,
              role: {
                in: [
                  UserRole.COMPANY_MEMBER,
                  UserRole.MANAGER,
                  UserRole.EMPLOYEE,
                ],
              },
            },
          }),
      this.prisma.task.count({ where: taskScope }),
      this.prisma.task.count({
        where: {
          ...taskScope,
          dueDate: { lt: now },
          status: { not: TaskStatus.DONE },
        },
      }),
      this.prisma.project
        .groupBy({
          by: ['status'],
          where: projectScope,
          _count: { _all: true },
        })
        .then((rows) =>
          rows.map((row) => ({
            key: row.status,
            count: row._count._all,
          })),
        ),
      this.prisma.task
        .groupBy({
          by: ['status'],
          where: taskScope,
          _count: { _all: true },
        })
        .then((rows) =>
          rows.map((row) => ({
            key: row.status,
            count: row._count._all,
          })),
        ),
      this.prisma.task
        .groupBy({
          by: ['priority'],
          where: taskScope,
          _count: { _all: true },
        })
        .then((rows) =>
          rows.map((row) => ({
            key: row.priority,
            count: row._count._all,
          })),
        ),
      this.prisma.task.findMany({
        where: {
          ...taskScope,
          status: TaskStatus.DONE,
          completedAt: { gte: thirtyDaysAgo },
          project: {
            ...this.projectAccess.visibleWhere(actor),
            teamId: { not: null },
          },
        },
        select: {
          project: {
            select: {
              teamId: true,
              team: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.task.findMany({
        where: {
          ...taskScope,
          status: { not: TaskStatus.DONE },
          project: {
            ...this.projectAccess.visibleWhere(actor),
            teamId: { not: null },
          },
        },
        select: {
          project: {
            select: {
              teamId: true,
              team: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.task.findMany({
        where: {
          ...taskScope,
          OR: [
            { createdAt: { gte: firstActivityMonth } },
            { completedAt: { gte: firstActivityMonth } },
          ],
        },
        select: { createdAt: true, completedAt: true },
      }),
    ]);

    for (const task of activityTasks) {
      if (task.createdAt >= firstActivityMonth) {
        const month = activityByMonth.get(
          task.createdAt.toISOString().slice(0, 7),
        );
        if (month) month.created += 1;
      }
      if (task.completedAt && task.completedAt >= firstActivityMonth) {
        const month = activityByMonth.get(
          task.completedAt.toISOString().slice(0, 7),
        );
        if (month) month.completed += 1;
      }
    }

    const productivityByTeam = new Map<
      string,
      {
        teamId: string;
        teamName: string;
        completedLast30Days: number;
        openTasks: number;
      }
    >();
    const incrementTeamCount = (
      task: (typeof recentlyCompletedTasks)[number],
      field: 'completedLast30Days' | 'openTasks',
    ) => {
      const { teamId, team } = task.project;
      if (!teamId || !team) return;
      const summary = productivityByTeam.get(teamId) ?? {
        teamId,
        teamName: team.name,
        completedLast30Days: 0,
        openTasks: 0,
      };
      summary[field] += 1;
      productivityByTeam.set(teamId, summary);
    };
    recentlyCompletedTasks.forEach((task) =>
      incrementTeamCount(task, 'completedLast30Days'),
    );
    openTasksByTeam.forEach((task) => incrementTeamCount(task, 'openTasks'));

    return {
      kpis: {
        totalProjects,
        activeProjects,
        completedProjects,
        employees,
        totalTasks,
        overdueTasks,
      },
      projectsByStatus: this.completeCounts(
        PROJECT_STATUSES,
        projectStatusGroups,
        'status',
      ),
      tasksByStatus: this.completeCounts(
        TASK_STATUSES,
        taskStatusGroups,
        'status',
      ),
      tasksByPriority: this.completeCounts(
        PRIORITIES,
        taskPriorityGroups,
        'priority',
      ),
      teamProductivity: [...productivityByTeam.values()].sort((a, b) =>
        a.teamName.localeCompare(b.teamName),
      ),
      monthlyActivity: [...activityByMonth.values()],
    };
  }

  private completeCounts<T extends string>(
    values: readonly T[],
    rows: readonly CountRow<T>[],
    field: 'status' | 'priority',
  ) {
    const counts = new Map(rows.map((row) => [row.key, row.count]));
    return values.map((value) => ({
      [field]: value,
      count: counts.get(value) ?? 0,
    }));
  }
}
