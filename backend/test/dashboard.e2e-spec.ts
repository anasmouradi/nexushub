import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { hash } from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  Priority,
  ProjectStatus,
  TaskStatus,
  UserRole,
} from '../generated/prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

interface TestUser {
  id: string;
  companyId: string;
  accessToken: string;
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function getId(value: unknown): string {
  const record = getRecord(value);
  if (!record || typeof record.id !== 'string') {
    throw new Error('Response did not contain a valid ID');
  }
  return record.id;
}

function parseUser(value: unknown): TestUser {
  const record = getRecord(value);
  const user = getRecord(record?.user);
  if (
    !record ||
    !user ||
    typeof user.id !== 'string' ||
    typeof user.companyId !== 'string' ||
    typeof record.accessToken !== 'string'
  ) {
    throw new Error('Login did not return valid user data');
  }
  return {
    id: user.id,
    companyId: user.companyId,
    accessToken: record.accessToken,
  };
}

describe('Dashboard (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminA: TestUser;
  let adminB: TestUser;
  let managerA: TestUser;
  let alternateManagerA: TestUser;
  let employeeA: TestUser;
  let alternateEmployeeA: TestUser;
  let teamAId: string;
  let projectAId: string;
  let overdueTaskId: string;
  let completedOverdueTaskId: string;

  async function registerAdmin(companyName: string): Promise<TestUser> {
    const email = `admin-${randomUUID()}@example.com`;
    const password = 'correct-horse-battery-staple';
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ companyName: `${companyName} ${randomUUID()}`, email, password })
      .expect(201);
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    return parseUser(response.body);
  }

  async function addUser(companyId: string, role: UserRole): Promise<TestUser> {
    const email = `user-${randomUUID()}@example.com`;
    const password = 'correct-horse-battery-staple';
    await prisma.user.create({
      data: {
        email,
        passwordHash: await hash(password, 10),
        firstName: 'Dashboard',
        lastName: role,
        role,
        companyId,
      },
    });
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    return parseUser(response.body);
  }

  function auth(user: TestUser) {
    return { Authorization: `Bearer ${user.accessToken}` };
  }

  async function createProject(
    actor: TestUser,
    name: string,
    extra: Record<string, unknown> = {},
  ) {
    const response = await request(app.getHttpServer())
      .post('/api/projects')
      .set(auth(actor))
      .send({ name: `${name} ${randomUUID()}`, ...extra })
      .expect(201);
    return getId(response.body);
  }

  async function createTask(
    actor: TestUser,
    projectId: string,
    title: string,
    extra: Record<string, unknown> = {},
  ) {
    const response = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/tasks`)
      .set(auth(actor))
      .send({ title: `${title} ${randomUUID()}`, ...extra })
      .expect(201);
    return getId(response.body);
  }

  async function getDashboard(user: TestUser) {
    const response = await request(app.getHttpServer())
      .get('/api/dashboard')
      .set(auth(user))
      .expect(200);
    return response.body as {
      kpis: Record<string, number | null>;
      projectsByStatus: Array<{ status: string; count: number }>;
      tasksByStatus: Array<{ status: string; count: number }>;
      tasksByPriority: Array<{ priority: string; count: number }>;
      teamProductivity: Array<{
        teamId: string;
        teamName: string;
        completedLast30Days: number;
        openTasks: number;
      }>;
      monthlyActivity: Array<{
        month: string;
        created: number;
        completed: number;
      }>;
    };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    adminA = await registerAdmin('Dashboard Tenant A');
    adminB = await registerAdmin('Dashboard Tenant B');
    managerA = await addUser(adminA.companyId, UserRole.MANAGER);
    alternateManagerA = await addUser(adminA.companyId, UserRole.MANAGER);
    employeeA = await addUser(adminA.companyId, UserRole.EMPLOYEE);
    alternateEmployeeA = await addUser(adminA.companyId, UserRole.EMPLOYEE);

    const teamResponse = await request(app.getHttpServer())
      .post('/api/teams')
      .set(auth(adminA))
      .send({ name: `Dashboard team ${randomUUID()}`, managerId: managerA.id })
      .expect(201);
    teamAId = getId(teamResponse.body);

    projectAId = await createProject(adminA, 'Managed active project', {
      managerId: managerA.id,
      teamId: teamAId,
      status: ProjectStatus.IN_PROGRESS,
    });
    await createProject(adminA, 'Other manager completed project', {
      managerId: alternateManagerA.id,
      status: ProjectStatus.COMPLETED,
    });
    await createProject(adminA, 'Admin-only planning project');

    for (const user of [employeeA, alternateEmployeeA]) {
      await request(app.getHttpServer())
        .post(`/api/projects/${projectAId}/members`)
        .set(auth(adminA))
        .send({ userId: user.id })
        .expect(201);
    }

    overdueTaskId = await createTask(adminA, projectAId, 'Overdue open task', {
      assigneeId: employeeA.id,
      dueDate: '2020-01-01T00:00:00.000Z',
    });
    completedOverdueTaskId = await createTask(
      adminA,
      projectAId,
      'Overdue completed task',
      {
        assigneeId: employeeA.id,
        dueDate: '2020-01-01T00:00:00.000Z',
      },
    );
    await request(app.getHttpServer())
      .patch(`/api/tasks/${completedOverdueTaskId}`)
      .set(auth(adminA))
      .send({ status: TaskStatus.DONE })
      .expect(200);
    await createTask(adminA, projectAId, 'Other employee open task', {
      assigneeId: alternateEmployeeA.id,
      dueDate: '2099-01-01T00:00:00.000Z',
    });
  }, 30_000);

  afterAll(async () => {
    await app?.close();
  });

  it('keeps tenant A counts unchanged when tenant B gains many projects and tasks', async () => {
    const before = await getDashboard(adminA);
    const projects = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        prisma.project.create({
          data: {
            companyId: adminB.companyId,
            name: `Dashboard tenant B project ${index} ${randomUUID()}`,
            createdById: adminB.id,
            status: ProjectStatus.IN_PROGRESS,
          },
          select: { id: true },
        }),
      ),
    );
    await prisma.task.createMany({
      data: projects.map((project, index) => ({
        companyId: adminB.companyId,
        projectId: project.id,
        title: `Dashboard tenant B task ${index}`,
        creatorId: adminB.id,
      })),
    });
    const after = await getDashboard(adminA);

    expect(after.kpis).toEqual(before.kpis);
    expect(after.projectsByStatus).toEqual(before.projectsByStatus);
    expect(after.tasksByStatus).toEqual(before.tasksByStatus);
  });

  it('limits project and task aggregates to each role visibility', async () => {
    const [admin, manager, employee] = await Promise.all([
      getDashboard(adminA),
      getDashboard(managerA),
      getDashboard(employeeA),
    ]);

    expect(admin.kpis.totalProjects).toBe(3);
    expect(manager.kpis.totalProjects).toBe(1);
    expect(employee.kpis.totalProjects).toBe(1);
    expect(admin.kpis.totalTasks).toBe(3);
    expect(manager.kpis.totalTasks).toBe(3);
    expect(employee.kpis.totalTasks).toBe(2);
    expect(employee.kpis.employees).toBeNull();
    expect(admin.kpis.employees).toBe(4);
    expect(manager.projectsByStatus).toContainEqual({
      status: ProjectStatus.IN_PROGRESS,
      count: 1,
    });
    expect(manager.projectsByStatus).toContainEqual({
      status: ProjectStatus.COMPLETED,
      count: 0,
    });
  });

  it('does not count overdue tasks that are already done', async () => {
    const admin = await getDashboard(adminA);
    const employee = await getDashboard(employeeA);

    expect(admin.kpis.overdueTasks).toBe(1);
    expect(employee.kpis.overdueTasks).toBe(1);
    expect(admin.tasksByStatus).toContainEqual({
      status: TaskStatus.DONE,
      count: 1,
    });
    expect(completedOverdueTaskId).not.toBe(overdueTaskId);
  });

  it('returns zeroed status buckets and six months for an empty company', async () => {
    const emptyAdmin = await registerAdmin('Dashboard empty tenant');
    const dashboard = await getDashboard(emptyAdmin);

    expect(dashboard.kpis).toEqual({
      totalProjects: 0,
      activeProjects: 0,
      completedProjects: 0,
      employees: 0,
      totalTasks: 0,
      overdueTasks: 0,
    });
    expect(dashboard.projectsByStatus).toHaveLength(
      Object.values(ProjectStatus).length,
    );
    expect(dashboard.tasksByStatus).toHaveLength(
      Object.values(TaskStatus).length,
    );
    expect(dashboard.tasksByPriority).toHaveLength(
      Object.values(Priority).length,
    );
    expect(
      [
        ...dashboard.projectsByStatus,
        ...dashboard.tasksByStatus,
        ...dashboard.tasksByPriority,
      ].every((bucket) => bucket.count === 0),
    ).toBe(true);
    expect(dashboard.teamProductivity).toEqual([]);
    expect(dashboard.monthlyActivity).toHaveLength(6);
  });

  it('groups completed and open tasks by the project team', async () => {
    const dashboard = await getDashboard(adminA);
    const teamSummary = dashboard.teamProductivity.find(
      (team) => team.teamId === teamAId,
    );

    expect(teamSummary).toBeDefined();
    expect(teamSummary?.teamName.length).toBeGreaterThan(0);
    expect(teamSummary).toMatchObject({
      completedLast30Days: 1,
      openTasks: 2,
    });
    expect(dashboard.monthlyActivity).toHaveLength(6);
    expect(
      dashboard.monthlyActivity.reduce((sum, month) => sum + month.created, 0),
    ).toBe(3);
    expect(
      dashboard.monthlyActivity.reduce(
        (sum, month) => sum + month.completed,
        0,
      ),
    ).toBe(1);
  });
});
