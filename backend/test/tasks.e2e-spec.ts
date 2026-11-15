import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { hash } from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import {
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

function getTaskList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) throw new Error('Expected a task list');
  return value.map((item) => {
    const task = getRecord(item);
    if (!task || typeof task.id !== 'string') {
      throw new Error('Task list contained an invalid item');
    }
    return task;
  });
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

describe('Tasks (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminA: TestUser;
  let adminB: TestUser;
  let managerA: TestUser;
  let managerOtherA: TestUser;
  let managerB: TestUser;
  let employeeA: TestUser;
  let employeeOther: TestUser;
  let nonMemberA: TestUser;
  let employeeB: TestUser;
  let projectAId: string;
  let projectBId: string;
  let completedProjectId: string;
  let otherProjectId: string;
  let taskAId: string;
  let taskBId: string;

  async function registerAdmin(companyName: string): Promise<TestUser> {
    const email = `admin-${randomUUID()}@example.com`;
    const password = 'correct-horse-battery-staple';
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ companyName, email, password })
      .expect(201);
    return login(email, password);
  }

  async function login(email: string, password: string): Promise<TestUser> {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    return parseUser(response.body);
  }

  async function addUser(companyId: string, role: UserRole) {
    const email = `user-${randomUUID()}@example.com`;
    const password = 'correct-horse-battery-staple';
    await prisma.user.create({
      data: {
        email,
        passwordHash: await hash(password, 10),
        firstName: 'Task',
        lastName: role,
        role,
        companyId,
      },
    });
    return login(email, password);
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
      .send({ name, ...extra })
      .expect(201);
    return getId(response.body);
  }

  async function addProjectMember(
    actor: TestUser,
    projectId: string,
    userId: string,
  ) {
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/members`)
      .set(auth(actor))
      .send({ userId })
      .expect(201);
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
      .send({ title, ...extra })
      .expect(201);
    return getId(response.body);
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

    adminA = await registerAdmin('Tasks Tenant A');
    adminB = await registerAdmin('Tasks Tenant B');
    managerA = await addUser(adminA.companyId, UserRole.MANAGER);
    managerOtherA = await addUser(adminA.companyId, UserRole.MANAGER);
    managerB = await addUser(adminB.companyId, UserRole.MANAGER);
    employeeA = await addUser(adminA.companyId, UserRole.EMPLOYEE);
    employeeOther = await addUser(adminA.companyId, UserRole.EMPLOYEE);
    nonMemberA = await addUser(adminA.companyId, UserRole.EMPLOYEE);
    employeeB = await addUser(adminB.companyId, UserRole.EMPLOYEE);

    projectAId = await createProject(adminA, 'Task project A', {
      managerId: managerA.id,
    });
    projectBId = await createProject(adminB, 'Task project B', {
      managerId: managerB.id,
    });
    completedProjectId = await createProject(adminA, 'Completed task project', {
      status: ProjectStatus.COMPLETED,
    });
    otherProjectId = await createProject(adminA, 'Other task project');
    await addProjectMember(adminA, projectAId, employeeA.id);
    await addProjectMember(adminA, projectAId, employeeOther.id);
    await addProjectMember(adminA, projectAId, adminA.id);
    await addProjectMember(adminA, otherProjectId, employeeA.id);
    await addProjectMember(adminB, projectBId, employeeB.id);
    taskAId = await createTask(adminB, projectBId, 'Tenant B task', {
      assigneeId: employeeB.id,
    });
    taskBId = await createTask(adminA, projectAId, 'Tenant A assigned task', {
      assigneeId: employeeA.id,
    });
  }, 30_000);

  afterAll(async () => {
    await app?.close();
  });

  it('isolates task lists and task actions across tenants', async () => {
    const visible = await request(app.getHttpServer())
      .get(`/api/projects/${projectAId}/tasks`)
      .set(auth(adminA))
      .expect(200);
    expect(getTaskList(visible.body).map((task) => task.id)).not.toContain(
      taskAId,
    );

    await request(app.getHttpServer())
      .get(`/api/tasks/${taskAId}`)
      .set(auth(adminA))
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/tasks/${taskAId}`)
      .set(auth(adminA))
      .send({ title: 'Cross tenant edit' })
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/tasks/${taskAId}/move`)
      .set(auth(adminA))
      .send({ status: TaskStatus.DONE })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/tasks/${taskAId}`)
      .set(auth(adminA))
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/projects/${projectAId}/tasks`)
      .set(auth(adminA))
      .send({ title: 'Cross tenant assignee', assigneeId: employeeB.id })
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/tasks/${taskBId}`)
      .set(auth(adminA))
      .send({ assigneeId: employeeB.id })
      .expect(404);
  });

  it('limits employees to assigned task fields and project visibility', async () => {
    await request(app.getHttpServer())
      .get(`/api/tasks/${taskBId}`)
      .set(auth(employeeOther))
      .expect(200);
    const myTasks = await request(app.getHttpServer())
      .get('/api/tasks')
      .set(auth(employeeA))
      .expect(200);
    const myTaskIds = getTaskList(myTasks.body).map((task) => task.id);
    expect(myTaskIds).toContain(taskBId);
    expect(myTaskIds).not.toContain(taskAId);

    const hiddenProject = await createProject(
      adminA,
      'Employee hidden project',
    );
    const hiddenTaskId = await createTask(
      adminA,
      hiddenProject,
      'Task outside employee visibility',
    );
    await request(app.getHttpServer())
      .get(`/api/tasks/${hiddenTaskId}`)
      .set(auth(employeeA))
      .expect(404);

    const updated = await request(app.getHttpServer())
      .patch(`/api/tasks/${taskBId}`)
      .set(auth(employeeA))
      .send({
        status: TaskStatus.IN_PROGRESS,
        actualHours: 1.5,
        description: 'Progress update',
      })
      .expect(200);
    const updatedBody = getRecord(updated.body);
    if (!updatedBody) throw new Error('Task update response was invalid');
    expect(updatedBody).toMatchObject({
      status: TaskStatus.IN_PROGRESS,
      description: 'Progress update',
    });
    expect(Number(updatedBody.actualHours)).toBe(1.5);

    const clearedHours = await request(app.getHttpServer())
      .patch(`/api/tasks/${taskBId}`)
      .set(auth(employeeA))
      .send({ actualHours: null })
      .expect(200);
    const clearedHoursBody = getRecord(clearedHours.body);
    if (!clearedHoursBody) throw new Error('Task update response was invalid');
    expect(clearedHoursBody.actualHours).toBeNull();

    await request(app.getHttpServer())
      .patch(`/api/tasks/${taskBId}`)
      .set(auth(employeeOther))
      .send({ status: TaskStatus.REVIEW })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/tasks/${taskBId}`)
      .set(auth(employeeA))
      .send({ priority: 'HIGH' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/tasks/${taskBId}`)
      .set(auth(employeeA))
      .send({ assigneeId: employeeOther.id })
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/api/tasks/${taskBId}`)
      .set(auth(employeeA))
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/tasks/${taskBId}/move`)
      .set(auth(employeeA))
      .send({ status: TaskStatus.REVIEW })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/tasks/${taskBId}/move`)
      .set(auth(employeeOther))
      .send({ status: TaskStatus.REVIEW })
      .expect(403);
  });

  it('requires project membership for assignees and rejects terminal projects', async () => {
    await request(app.getHttpServer())
      .post(`/api/projects/${projectAId}/tasks`)
      .set(auth(adminA))
      .send({ title: 'Non-member assignee', assigneeId: nonMemberA.id })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/projects/${projectAId}/tasks`)
      .set(auth(adminA))
      .send({ title: 'Invalid estimated hours', estimatedHours: 0 })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/projects/${projectAId}/tasks`)
      .set(auth(adminA))
      .send({ title: 'Spoofed creator', creatorId: employeeA.id })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/projects/${completedProjectId}/tasks`)
      .set(auth(adminA))
      .send({ title: 'Task in completed project' })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/projects/${projectAId}/tasks`)
      .set(auth(employeeA))
      .send({ title: 'Employee task creation' })
      .expect(403);
  });

  it('orders tasks on move and sets or clears completedAt as status changes', async () => {
    const firstId = await createTask(adminA, projectAId, 'Move task first');
    const secondId = await createTask(adminA, projectAId, 'Move task second');
    const thirdId = await createTask(adminA, projectAId, 'Move task third');

    await request(app.getHttpServer())
      .patch(`/api/tasks/${thirdId}/move`)
      .set(auth(adminA))
      .send({ status: TaskStatus.TODO, afterId: firstId })
      .expect(200);

    const taskList = await request(app.getHttpServer())
      .get(`/api/projects/${projectAId}/tasks?status=${TaskStatus.TODO}`)
      .set(auth(adminA))
      .expect(200);
    const orderedIds = getTaskList(taskList.body).map((task) => task.id);
    expect(orderedIds.indexOf(thirdId)).toBeLessThan(
      orderedIds.indexOf(firstId),
    );
    expect(orderedIds.indexOf(firstId)).toBeLessThan(
      orderedIds.indexOf(secondId),
    );

    const completed = await request(app.getHttpServer())
      .patch(`/api/tasks/${thirdId}`)
      .set(auth(adminA))
      .send({ status: TaskStatus.DONE })
      .expect(200);
    const completedBody = getRecord(completed.body);
    if (!completedBody) throw new Error('Completed task response was invalid');
    expect(completedBody.completedAt).toEqual(expect.any(String));

    const reopened = await request(app.getHttpServer())
      .patch(`/api/tasks/${thirdId}`)
      .set(auth(adminA))
      .send({ status: TaskStatus.TODO })
      .expect(200);
    const reopenedBody = getRecord(reopened.body);
    if (!reopenedBody) throw new Error('Reopened task response was invalid');
    expect(reopenedBody.completedAt).toBeNull();
  });

  it('rejects move anchors from another project and filters overdue tasks', async () => {
    const otherProjectTaskId = await createTask(
      adminA,
      otherProjectId,
      'Task from another project',
    );
    const overdueTaskId = await createTask(adminA, projectAId, 'Overdue task', {
      assigneeId: employeeA.id,
      dueDate: '2020-01-01T00:00:00.000Z',
    });
    const normalTaskId = await createTask(
      adminA,
      projectAId,
      'Not overdue task',
      { assigneeId: employeeA.id },
    );

    await request(app.getHttpServer())
      .patch(`/api/tasks/${normalTaskId}/move`)
      .set(auth(adminA))
      .send({ status: TaskStatus.TODO, afterId: otherProjectTaskId })
      .expect(400);

    const overdue = await request(app.getHttpServer())
      .get(`/api/tasks?assigneeId=${employeeA.id}&overdue=true`)
      .set(auth(adminA))
      .expect(200);
    const ids = getTaskList(overdue.body).map((task) => task.id);
    expect(ids).toContain(overdueTaskId);
    expect(ids).not.toContain(normalTaskId);
    expect(ids).not.toContain(taskAId);

    const filteredByStatus = await request(app.getHttpServer())
      .get(
        `/api/tasks?assigneeId=${employeeA.id}&overdue=true&status=${TaskStatus.IN_PROGRESS}`,
      )
      .set(auth(adminA))
      .expect(200);
    expect(getTaskList(filteredByStatus.body)).toHaveLength(0);
  });

  it('allows only the project manager to make manager-level task changes', async () => {
    await addProjectMember(adminA, projectAId, managerOtherA.id);
    await request(app.getHttpServer())
      .patch(`/api/tasks/${taskBId}`)
      .set(auth(managerOtherA))
      .send({ title: 'Unauthorized manager edit' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/tasks/${taskBId}`)
      .set(auth(managerA))
      .send({ title: 'Authorized manager edit' })
      .expect(200);
  });
});
