import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';
import type { AuthUser } from './../src/auth/auth.types';
import { AppModule } from './../src/app.module';

interface AuthResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: AuthUser;
}

function isAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const user = value as Record<string, unknown>;
  return (
    typeof user.id === 'string' &&
    typeof user.email === 'string' &&
    typeof user.companyId === 'string' &&
    typeof user.role === 'string'
  );
}

function isAuthResponse(value: unknown): value is AuthResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const response = value as Record<string, unknown>;
  return (
    typeof response.accessToken === 'string' &&
    response.tokenType === 'Bearer' &&
    typeof response.expiresIn === 'number' &&
    isAuthUser(response.user)
  );
}

function getSetCookie(response: { headers: Record<string, unknown> }): string {
  const cookies = response.headers['set-cookie'];
  if (Array.isArray(cookies) && typeof cookies[0] === 'string') {
    return cookies[0];
  }
  throw new Error('Refresh cookie was not set');
}

describe('API (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
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
  });

  it('returns database health without authentication', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect({ status: 'ok', database: 'up' });
  });

  it('registers a company admin, logs in, and protects the profile route', async () => {
    const email = `auth-${randomUUID()}@example.com`;
    const password = 'correct-horse-battery-staple';
    const registration = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ companyName: 'NexusHub Test', email, password })
      .expect(201);
    const registeredUser: unknown = registration.body;
    if (!isAuthUser(registeredUser)) {
      throw new Error('Registration did not return valid user data');
    }

    expect(registeredUser).toMatchObject({
      email,
      role: 'COMPANY_ADMIN',
    });
    expect(registeredUser).not.toHaveProperty('passwordHash');

    await request(app.getHttpServer()).get('/api/auth/me').expect(401);

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    const loginBody: unknown = login.body;
    if (!isAuthResponse(loginBody)) {
      throw new Error('Login did not return valid access-token data');
    }

    expect(loginBody).toMatchObject({
      tokenType: 'Bearer',
      expiresIn: 900,
      user: registeredUser,
    });
    expect(loginBody).not.toHaveProperty('refreshToken');
    const loginSetCookie = getSetCookie(login);
    expect(loginSetCookie).toContain('HttpOnly');
    expect(loginSetCookie).toContain('Path=/api/auth');

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${loginBody.accessToken}`)
      .expect(200)
      .expect(registeredUser);
  });

  it('rotates refresh tokens and revokes them on logout', async () => {
    const email = `refresh-${randomUUID()}@example.com`;
    const password = 'correct-horse-battery-staple';
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ companyName: 'NexusHub Test', email, password })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    const loginSetCookie = getSetCookie(login);
    const refreshCookie = loginSetCookie.split(';')[0];

    const refresh = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookie)
      .expect(200);
    const refreshBody: unknown = refresh.body;
    if (!isAuthResponse(refreshBody)) {
      throw new Error('Refresh did not return valid access-token data');
    }
    expect(refreshBody.accessToken).toBeDefined();
    const refreshSetCookie = getSetCookie(refresh);
    expect(refreshSetCookie).not.toBe(loginSetCookie);

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookie)
      .expect(401);

    const rotatedCookie = refreshSetCookie.split(';')[0];
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', rotatedCookie)
      .expect(200)
      .expect({ status: 'ok' });

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', rotatedCookie)
      .expect(401);
  });

  afterEach(async () => {
    await app.close();
  });
});
