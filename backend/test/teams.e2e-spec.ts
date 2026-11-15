import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { hash } from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { UserRole } from '../generated/prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

interface TestUser {
  id: string;
  companyId: string;
  accessToken: string;
}

interface TeamSummary {
  id: string;
  membersCount: number;
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

function parseTeamSummaries(value: unknown): TeamSummary[] {
  if (!Array.isArray(value)) {
    throw new Error('Team list response was not an array');
  }
  return value.map((item: unknown) => {
    const record = getRecord(item);
    if (
      !record ||
      typeof record.id !== 'string' ||
      typeof record.membersCount !== 'number'
    ) {
      throw new Error('Team list response contained an invalid team');
    }
    return { id: record.id, membersCount: record.membersCount };
  });
}

function parseTeamMemberIds(value: unknown): string[] {
  const record = getRecord(value);
  if (!record || !Array.isArray(record.members)) {
    throw new Error('Team response did not contain a member list');
  }
  return record.members.map((item: unknown) => {
    const member = getRecord(item);
    const user = getRecord(member?.user);
    if (!user || typeof user.id !== 'string') {
      throw new Error('Team response contained an invalid member');
    }
    return user.id;
  });
}

describe('Teams (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminA: TestUser;
  let adminB: TestUser;
  let managerA: TestUser;
  let otherManagerA: TestUser;
  let managerB: TestUser;
  let employeeA: TestUser;
  let employeeB: TestUser;

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
        firstName: 'Test',
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

    adminA = await registerAdmin('Teams Tenant A');
    adminB = await registerAdmin('Teams Tenant B');
    managerA = await addUser(adminA.companyId, UserRole.MANAGER);
    otherManagerA = await addUser(adminA.companyId, UserRole.MANAGER);
    managerB = await addUser(adminB.companyId, UserRole.MANAGER);
    employeeA = await addUser(adminA.companyId, UserRole.EMPLOYEE);
    employeeB = await addUser(adminB.companyId, UserRole.EMPLOYEE);
  }, 30_000);

  it('scopes team listing and team IDs to the authenticated company', async () => {
    const teamA = await request(app.getHttpServer())
      .post('/api/teams')
      .set(auth(adminA))
      .send({ name: `A ${randomUUID()}` })
      .expect(201);
    const teamB = await request(app.getHttpServer())
      .post('/api/teams')
      .set(auth(adminB))
      .send({ name: `B ${randomUUID()}` })
      .expect(201);

    const list = await request(app.getHttpServer())
      .get('/api/teams')
      .set(auth(adminA))
      .expect(200);
    const teamAId = getId(teamA.body);
    const teamBId = getId(teamB.body);
    const teamIds = parseTeamSummaries(list.body).map((team) => team.id);
    expect(teamIds).toContain(teamAId);
    expect(teamIds).not.toContain(teamBId);

    await request(app.getHttpServer())
      .get(`/api/teams/${teamBId}`)
      .set(auth(adminA))
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/teams/${teamBId}`)
      .set(auth(adminA))
      .send({ name: 'No access' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/teams/${teamBId}`)
      .set(auth(adminA))
      .expect(404);
  });

  it('rejects cross-company members and managers', async () => {
    const team = await request(app.getHttpServer())
      .post('/api/teams')
      .set(auth(adminA))
      .send({ name: `Team ${randomUUID()}` })
      .expect(201);
    const teamId = getId(team.body);

    await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/members`)
      .set(auth(adminA))
      .send({ userId: employeeB.id })
      .expect(404);
    await request(app.getHttpServer())
      .post('/api/teams')
      .set(auth(adminA))
      .send({
        name: `Cross tenant manager ${randomUUID()}`,
        managerId: managerB.id,
      })
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/teams/${teamId}`)
      .set(auth(adminA))
      .send({ managerId: managerB.id })
      .expect(404);
    await request(app.getHttpServer())
      .post('/api/teams')
      .set(auth(adminA))
      .send({
        name: `Invalid manager ${randomUUID()}`,
        managerId: employeeA.id,
      })
      .expect(404);
  });

  it('forbids employees from creating teams', async () => {
    await request(app.getHttpServer())
      .post('/api/teams')
      .set(auth(employeeA))
      .send({ name: `Employee team ${randomUUID()}` })
      .expect(403);
  });

  it('allows a manager to manage members only on their own team', async () => {
    const ownTeam = await request(app.getHttpServer())
      .post('/api/teams')
      .set(auth(adminA))
      .send({ name: `Manager team ${randomUUID()}`, managerId: managerA.id })
      .expect(201);
    const otherTeam = await request(app.getHttpServer())
      .post('/api/teams')
      .set(auth(adminA))
      .send({
        name: `Other manager team ${randomUUID()}`,
        managerId: otherManagerA.id,
      })
      .expect(201);
    const ownTeamId = getId(ownTeam.body);
    const otherTeamId = getId(otherTeam.body);

    await request(app.getHttpServer())
      .post(`/api/teams/${ownTeamId}/members`)
      .set(auth(managerA))
      .send({ userId: employeeA.id })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/teams/${otherTeamId}/members`)
      .set(auth(managerA))
      .send({ userId: employeeA.id })
      .expect(403);

    const detail = await request(app.getHttpServer())
      .get(`/api/teams/${ownTeamId}`)
      .set(auth(adminA))
      .expect(200);
    expect(parseTeamMemberIds(detail.body)).toContain(managerA.id);

    await request(app.getHttpServer())
      .delete(`/api/teams/${ownTeamId}/members/${managerA.id}`)
      .set(auth(adminA))
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/api/teams/${ownTeamId}`)
      .set(auth(adminA))
      .send({ managerId: otherManagerA.id })
      .expect(200);
    const changedTeam = await request(app.getHttpServer())
      .get(`/api/teams/${ownTeamId}`)
      .set(auth(adminA))
      .expect(200);
    expect(parseTeamMemberIds(changedTeam.body)).toEqual(
      expect.arrayContaining([managerA.id, otherManagerA.id]),
    );
    await request(app.getHttpServer())
      .post(`/api/teams/${ownTeamId}/members`)
      .set(auth(managerA))
      .send({ userId: employeeA.id })
      .expect(403);
  });

  it('enforces name uniqueness per company and includes only active members', async () => {
    const name = `Shared team ${randomUUID()}`;
    await request(app.getHttpServer())
      .post('/api/teams')
      .set(auth(adminA))
      .send({ name: '   ' })
      .expect(400);

    const first = await request(app.getHttpServer())
      .post('/api/teams')
      .set(auth(adminA))
      .send({ name })
      .expect(201);
    const firstId = getId(first.body);
    await request(app.getHttpServer())
      .post('/api/teams')
      .set(auth(adminA))
      .send({ name })
      .expect(409);
    await request(app.getHttpServer())
      .post('/api/teams')
      .set(auth(adminB))
      .send({ name })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/teams/${firstId}/members`)
      .set(auth(adminA))
      .send({ userId: employeeA.id })
      .expect(201);
    await prisma.user.update({
      where: { id: employeeA.id },
      data: { isActive: false },
    });

    const detail = await request(app.getHttpServer())
      .get(`/api/teams/${firstId}`)
      .set(auth(adminA))
      .expect(200);
    expect(parseTeamMemberIds(detail.body)).toHaveLength(0);
    const list = await request(app.getHttpServer())
      .get('/api/teams')
      .set(auth(adminA))
      .expect(200);
    expect(
      parseTeamSummaries(list.body).find((team) => team.id === firstId)
        ?.membersCount,
    ).toBe(0);
  });

  afterAll(async () => {
    await app.close();
  });
});
