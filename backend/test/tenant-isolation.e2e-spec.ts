import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { UserRole } from '../generated/prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    companyId: string;
    role: UserRole;
  };
}

interface TenantAdmin extends LoginResponse {
  email: string;
}

function isLoginResponse(value: unknown): value is LoginResponse {
  if (!value || typeof value !== 'object') return false;
  const response = value as Record<string, unknown>;
  if (!response.user || typeof response.user !== 'object') return false;
  const user = response.user as Record<string, unknown>;
  return (
    typeof response.accessToken === 'string' &&
    typeof user.id === 'string' &&
    typeof user.email === 'string' &&
    typeof user.companyId === 'string' &&
    typeof user.role === 'string'
  );
}

function isUserListResponse(
  value: unknown,
): value is { data: Array<{ email: string }> } {
  if (!value || typeof value !== 'object') return false;
  const data = (value as Record<string, unknown>).data;
  return (
    Array.isArray(data) &&
    data.every(
      (user) =>
        !!user &&
        typeof user === 'object' &&
        typeof (user as Record<string, unknown>).email === 'string',
    )
  );
}

describe('Tenant isolation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminA: TenantAdmin;
  let adminB: TenantAdmin;

  async function registerAdmin(companyName: string): Promise<TenantAdmin> {
    const email = `tenant-${randomUUID()}@example.com`;
    const password = 'correct-horse-battery-staple';
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ companyName, email, password })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    if (!isLoginResponse(login.body)) {
      throw new Error('Login did not return valid access-token data');
    }
    return { ...login.body, email };
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

    adminA = await registerAdmin('Tenant A');
    adminB = await registerAdmin('Tenant B');
  });

  it('only reads and mutates users in the authenticated company', async () => {
    const profile = await request(app.getHttpServer())
      .patch('/api/users/me')
      .set('Authorization', `Bearer ${adminA.accessToken}`)
      .send({ firstName: 'Tenant', lastName: 'Admin' })
      .expect(200);
    const profileBody: unknown = profile.body;
    expect(profileBody).toMatchObject({
      email: adminA.email,
      firstName: 'Tenant',
      lastName: 'Admin',
    });
    expect(profileBody).not.toHaveProperty('passwordHash');

    const list = await request(app.getHttpServer())
      .get('/api/users?page=1&limit=10')
      .set('Authorization', `Bearer ${adminA.accessToken}`)
      .expect(200);
    const listBody: unknown = list.body;
    if (!isUserListResponse(listBody)) {
      throw new Error('User list did not return valid user data');
    }

    expect(listBody.data.map((user) => user.email)).toEqual([adminA.email]);
    expect(listBody.data[0]).not.toHaveProperty('passwordHash');

    await request(app.getHttpServer())
      .get(`/api/users/${adminB.user.id}`)
      .set('Authorization', `Bearer ${adminA.accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/users/${adminB.user.id}`)
      .set('Authorization', `Bearer ${adminA.accessToken}`)
      .send({ firstName: 'Unauthorized' })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/api/users/${adminB.user.id}`)
      .set('Authorization', `Bearer ${adminA.accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/users/${adminA.user.id}`)
      .set('Authorization', `Bearer ${adminA.accessToken}`)
      .send({ role: UserRole.SUPER_ADMIN })
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/api/users/${adminA.user.id}`)
      .set('Authorization', `Bearer ${adminA.accessToken}`)
      .send({ role: UserRole.MANAGER })
      .expect(400);

    await request(app.getHttpServer())
      .delete(`/api/users/${adminA.user.id}`)
      .set('Authorization', `Bearer ${adminA.accessToken}`)
      .expect(400);
  });

  it('restricts invitation creation and rejects expired invitations', async () => {
    const loggerSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const invitedEmail = `employee-${randomUUID()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/users/invitations')
      .set('Authorization', `Bearer ${adminA.accessToken}`)
      .send({
        email: `super-admin-${randomUUID()}@example.com`,
        role: UserRole.SUPER_ADMIN,
      })
      .expect(400);

    const invitationResponse = await request(app.getHttpServer())
      .post('/api/users/invitations')
      .set('Authorization', `Bearer ${adminA.accessToken}`)
      .send({ email: invitedEmail, role: UserRole.EMPLOYEE })
      .expect(201);

    expect(invitationResponse.body).not.toHaveProperty('tokenHash');
    await request(app.getHttpServer())
      .post('/api/users/invitations')
      .set('Authorization', `Bearer ${adminA.accessToken}`)
      .send({ email: invitedEmail, role: UserRole.EMPLOYEE })
      .expect(409);
    let logMessage: string | undefined;
    for (const [message] of loggerSpy.mock.calls) {
      if (
        typeof message === 'string' &&
        message.includes('/accept-invite?token=')
      ) {
        logMessage = message;
        break;
      }
    }
    loggerSpy.mockRestore();
    if (!logMessage) throw new Error('Invitation link was not logged');
    const rawToken = decodeURIComponent(logMessage.split('token=')[1]);

    await request(app.getHttpServer())
      .post('/api/auth/accept-invite')
      .send({
        token: rawToken,
        firstName: 'Test',
        lastName: 'Employee',
        password: 'correct-horse-battery-staple',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/users/invitations')
      .set('Authorization', `Bearer ${adminA.accessToken}`)
      .send({ email: invitedEmail, role: UserRole.EMPLOYEE })
      .expect(409);

    const employeeLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: invitedEmail,
        password: 'correct-horse-battery-staple',
      })
      .expect(200);
    if (!isLoginResponse(employeeLogin.body)) {
      throw new Error('Employee login did not return valid access-token data');
    }

    await request(app.getHttpServer())
      .post('/api/users/invitations')
      .set('Authorization', `Bearer ${employeeLogin.body.accessToken}`)
      .send({
        email: `forbidden-${randomUUID()}@example.com`,
        role: UserRole.EMPLOYEE,
      })
      .expect(403);

    const cookieHeader = employeeLogin.headers['set-cookie'];
    if (!Array.isArray(cookieHeader) || typeof cookieHeader[0] !== 'string') {
      throw new Error('Employee refresh cookie was not set');
    }
    const refreshCookie = cookieHeader[0].split(';')[0];

    await request(app.getHttpServer())
      .delete(`/api/users/${employeeLogin.body.user.id}`)
      .set('Authorization', `Bearer ${adminA.accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/users')
      .set('Authorization', `Bearer ${employeeLogin.body.accessToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookie)
      .expect(401);

    const expiredToken = randomBytes(32).toString('base64url');
    await prisma.invitation.create({
      data: {
        companyId: adminA.user.companyId,
        invitedById: adminA.user.id,
        email: `expired-${randomUUID()}@example.com`,
        role: UserRole.EMPLOYEE,
        tokenHash: createHash('sha256').update(expiredToken).digest('hex'),
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    await request(app.getHttpServer())
      .post('/api/auth/accept-invite')
      .send({
        token: expiredToken,
        firstName: 'Expired',
        lastName: 'Invite',
        password: 'correct-horse-battery-staple',
      })
      .expect(400);
  });

  afterAll(async () => {
    await app.close();
  });
});
