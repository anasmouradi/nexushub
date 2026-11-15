import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { hash } from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { ProjectStatus, UserRole } from '../generated/prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

interface TestUser {
  id: string;
  companyId: string;
  accessToken: string;
}

interface ProjectList {
  data: Array<{ id: string; status: ProjectStatus }>;
  page: number;
  limit: number;
  total: number;
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

function parseTestUser(value: unknown): TestUser {
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

function parseProjectList(value: unknown): ProjectList {
  const record = getRecord(value);
  if (
    !record ||
    !Array.isArray(record.data) ||
    typeof record.page !== 'number' ||
    typeof record.limit !== 'number' ||
    typeof record.total !== 'number'
  ) {
    throw new Error('Project list response was invalid');
  }
  return {
    data: record.data.map((item: unknown) => {
      const project = getRecord(item);
      if (
        !project ||
        typeof project.id !== 'string' ||
        typeof project.status !== 'string'
      ) {
        throw new Error('Project list contained an invalid project');
      }
      return {
        id: project.id,
        status: project.status as ProjectStatus,
      };
    }),
    page: record.page,
    limit: record.limit,
    total: record.total,
  };
}

function parseMemberIds(value: unknown): string[] {
  const record = getRecord(value);
  if (!record || !Array.isArray(record.members)) {
    throw new Error('Project response did not contain members');
  }
  return record.members.map((item: unknown) => {
    const member = getRecord(item);
    const user = getRecord(member?.user);
    if (!user || typeof user.id !== 'string') {
      throw new Error('Project response contained an invalid member');
    }
    return user.id;
  });
}

describe('Projects (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminA: TestUser;
  let adminB: TestUser;
  let managerA: TestUser;
  let alternateManagerA: TestUser;
  let managerB: TestUser;
  let employeeA: TestUser;
  let employeeB: TestUser;
  let teamAId: string;
  let teamBId: string;
  let crossTenantProjectId: string;

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
    return parseTestUser(response.body);
  }

  async function addUser(companyId: string, role: UserRole): Promise<TestUser> {
    const email = `user-${randomUUID()}@example.com`;
    const password = 'correct-horse-battery-staple';
    await prisma.user.create({
      data: {
        email,
        passwordHash: await hash(password, 10),
        firstName: 'Project',
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
    data: Record<string, unknown> = {},
  ) {
    const response = await request(app.getHttpServer())
      .post('/api/projects')
      .set(auth(actor))
      .send({ name, ...data })
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

    adminA = await registerAdmin('Projects Tenant A');
    adminB = await registerAdmin('Projects Tenant B');
    managerA = await addUser(adminA.companyId, UserRole.MANAGER);
    alternateManagerA = await addUser(adminA.companyId, UserRole.MANAGER);
    managerB = await addUser(adminB.companyId, UserRole.MANAGER);
    employeeA = await addUser(adminA.companyId, UserRole.EMPLOYEE);
    employeeB = await addUser(adminB.companyId, UserRole.EMPLOYEE);

    const teamA = await request(app.getHttpServer())
      .post('/api/teams')
      .set(auth(adminA))
      .send({ name: `Project team A ${randomUUID()}`, managerId: managerA.id })
      .expect(201);
    teamAId = getId(teamA.body);
    await request(app.getHttpServer())
      .post(`/api/teams/${teamAId}/members`)
      .set(auth(adminA))
      .send({ userId: employeeA.id })
      .expect(201);

    const teamB = await request(app.getHttpServer())
      .post('/api/teams')
      .set(auth(adminB))
      .send({ name: `Project team B ${randomUUID()}`, managerId: managerB.id })
      .expect(201);
    teamBId = getId(teamB.body);
    crossTenantProjectId = await createProject(adminB, 'Cross tenant project', {
      teamId: teamBId,
      managerId: managerB.id,
    });
  }, 30_000);

  afterAll(async () => {
    await app?.close();
  });

  it('isolates projects, teams, managers, and members by company', async () => {
    const projectId = await createProject(adminA, 'Tenant A isolated project');

    const list = await request(app.getHttpServer())
      .get('/api/projects')
      .set(auth(adminA))
      .expect(200);
    expect(
      parseProjectList(list.body).data.map((project) => project.id),
    ).toContain(projectId);
    expect(
      parseProjectList(list.body).data.map((project) => project.id),
    ).not.toContain(crossTenantProjectId);

    await request(app.getHttpServer())
      .get(`/api/projects/${crossTenantProjectId}`)
      .set(auth(adminA))
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/projects/${crossTenantProjectId}`)
      .set(auth(adminA))
      .send({ name: 'Unauthorized' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/projects/${crossTenantProjectId}`)
      .set(auth(adminA))
      .expect(404);

    await request(app.getHttpServer())
      .post('/api/projects')
      .set(auth(adminA))
      .send({ name: 'Invalid cross tenant team', teamId: teamBId })
      .expect(404);
    await request(app.getHttpServer())
      .post('/api/projects')
      .set(auth(adminA))
      .send({
        name: 'Invalid cross tenant manager',
        managerId: managerB.id,
      })
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/members`)
      .set(auth(adminA))
      .send({ userId: employeeB.id })
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/projects/${projectId}`)
      .set(auth(adminA))
      .send({ teamId: teamBId })
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/projects/${projectId}`)
      .set(auth(adminA))
      .send({ managerId: managerB.id })
      .expect(404);
  });

  it('restricts project visibility to project members and restores it after joining', async () => {
    const projectId = await createProject(
      adminA,
      'Employee visibility project',
    );
    const before = await request(app.getHttpServer())
      .get('/api/projects')
      .set(auth(employeeA))
      .expect(200);
    expect(
      parseProjectList(before.body).data.map((project) => project.id),
    ).not.toContain(projectId);
    await request(app.getHttpServer())
      .get(`/api/projects/${projectId}`)
      .set(auth(employeeA))
      .expect(404);

    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/members`)
      .set(auth(adminA))
      .send({ userId: employeeA.id })
      .expect(201);
    const after = await request(app.getHttpServer())
      .get('/api/projects')
      .set(auth(employeeA))
      .expect(200);
    expect(
      parseProjectList(after.body).data.map((project) => project.id),
    ).toContain(projectId);
    await request(app.getHttpServer())
      .get(`/api/projects/${projectId}`)
      .set(auth(employeeA))
      .expect(200);
  });

  it('lets a manager modify only projects assigned to them', async () => {
    const managedId = await createProject(managerA, 'Manager owned project');
    const otherManagedId = await createProject(
      adminA,
      'Other manager project',
      {
        managerId: alternateManagerA.id,
      },
    );

    await request(app.getHttpServer())
      .post(`/api/projects/${managedId}/members`)
      .set(auth(managerA))
      .send({ userId: employeeA.id })
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/api/projects/${managedId}/members/${employeeA.id}`)
      .set(auth(managerA))
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/projects/${otherManagedId}`)
      .set(auth(managerA))
      .send({ name: 'Unauthorized manager edit' })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/projects/${otherManagedId}/members`)
      .set(auth(managerA))
      .send({ userId: employeeA.id })
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/api/projects/${otherManagedId}/members/${alternateManagerA.id}`)
      .set(auth(managerA))
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/projects/${managedId}`)
      .set(auth(managerA))
      .send({ name: 'Authorized manager edit' })
      .expect(200);

    const detail = await request(app.getHttpServer())
      .get(`/api/projects/${managedId}`)
      .set(auth(managerA))
      .expect(200);
    expect(parseMemberIds(detail.body)).toContain(managerA.id);
  });

  it('validates date ranges for creation and updates', async () => {
    await request(app.getHttpServer())
      .post('/api/projects')
      .set(auth(adminA))
      .send({
        name: 'Invalid date range',
        startDate: '2026-03-20T00:00:00.000Z',
        dueDate: '2026-03-19T00:00:00.000Z',
      })
      .expect(400);

    const projectId = await createProject(adminA, 'Date validation project', {
      startDate: '2026-03-10T00:00:00.000Z',
    });
    await request(app.getHttpServer())
      .patch(`/api/projects/${projectId}`)
      .set(auth(adminA))
      .send({ dueDate: '2026-03-09T00:00:00.000Z' })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/projects/${projectId}`)
      .set(auth(adminA))
      .send({ dueDate: '2026-03-10T00:00:00.000Z' })
      .expect(200);
  });

  it('rejects project creation by employees and invalid manager roles', async () => {
    await request(app.getHttpServer())
      .post('/api/projects')
      .set(auth(employeeA))
      .send({ name: 'Employee cannot create' })
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/projects')
      .set(auth(adminA))
      .send({ name: 'Employee cannot manage', managerId: employeeA.id })
      .expect(404);
  });

  it('filters, searches, paginates, and optionally copies team members', async () => {
    const unique = randomUUID();
    await createProject(adminA, `Filter project first ${unique}`, {
      status: ProjectStatus.IN_PROGRESS,
    });
    const secondId = await createProject(
      adminA,
      `Filter project second ${unique}`,
      { status: ProjectStatus.IN_PROGRESS, teamId: teamAId },
    );
    await createProject(adminA, `Planning project ${unique}`);
    const copiedId = await createProject(
      adminA,
      `Team members copied ${unique}`,
      {
        teamId: teamAId,
        managerId: alternateManagerA.id,
        addTeamMembers: true,
      },
    );

    const filtered = await request(app.getHttpServer())
      .get(
        `/api/projects?status=${ProjectStatus.IN_PROGRESS}&search=${unique}&limit=1&page=1`,
      )
      .set(auth(adminA))
      .expect(200);
    const firstPage = parseProjectList(filtered.body);
    expect(firstPage.total).toBe(2);
    expect(firstPage.data).toHaveLength(1);
    expect(firstPage.data[0].status).toBe(ProjectStatus.IN_PROGRESS);

    const nextPage = await request(app.getHttpServer())
      .get(
        `/api/projects?status=${ProjectStatus.IN_PROGRESS}&search=${unique}&limit=1&page=2`,
      )
      .set(auth(adminA))
      .expect(200);
    expect(parseProjectList(nextPage.body).data).toHaveLength(1);
    expect(parseProjectList(nextPage.body).data[0].id).not.toBe(
      firstPage.data[0].id,
    );

    const teamFiltered = await request(app.getHttpServer())
      .get(`/api/projects?teamId=${teamAId}&search=${unique}`)
      .set(auth(adminA))
      .expect(200);
    expect(
      parseProjectList(teamFiltered.body).data.map((project) => project.id),
    ).toContain(secondId);

    const copied = await request(app.getHttpServer())
      .get(`/api/projects/${copiedId}`)
      .set(auth(adminA))
      .expect(200);
    expect(parseMemberIds(copied.body)).toEqual(
      expect.arrayContaining([managerA.id, employeeA.id, alternateManagerA.id]),
    );

    const notCopiedId = await createProject(
      adminA,
      `Team members not copied ${unique}`,
      { teamId: teamAId },
    );
    const notCopied = await request(app.getHttpServer())
      .get(`/api/projects/${notCopiedId}`)
      .set(auth(adminA))
      .expect(200);
    expect(parseMemberIds(notCopied.body)).toEqual([]);
  });
});
