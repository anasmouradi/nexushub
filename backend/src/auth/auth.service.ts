import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole, Prisma, type User } from '../../generated/prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AccessTokenPayload, AuthUser } from './auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { REFRESH_TOKEN_TTL_MS } from './auth.constants';

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export interface AuthTokens {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: AuthUser;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthUser> {
    if (Buffer.byteLength(dto.password, 'utf8') > 72) {
      throw new BadRequestException('Password must not exceed 72 UTF-8 bytes');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    try {
      const user = await this.prisma.$transaction(async (transaction) => {
        const company = await transaction.company.create({
          data: { name: dto.companyName.trim() },
        });

        return transaction.user.create({
          data: {
            email: dto.email,
            passwordHash,
            role: UserRole.COMPANY_ADMIN,
            companyId: company.id,
          },
        });
      });

      return this.toAuthUser(user);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    if (Buffer.byteLength(dto.password, 'utf8') > 72) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (
      !user ||
      !user.isActive ||
      !(await bcrypt.compare(dto.password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.createSession(user);
  }

  async refresh(rawToken?: string): Promise<AuthTokens> {
    if (!rawToken) {
      throw new UnauthorizedException('A refresh token is required');
    }

    const tokenHash = this.hashToken(rawToken);
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (storedToken.revokedAt) {
      await this.revokeAllRefreshTokens(storedToken.userId);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    const now = new Date();
    if (storedToken.expiresAt <= now || !storedToken.user.isActive) {
      await this.prisma.refreshToken.updateMany({
        where: { id: storedToken.id, revokedAt: null },
        data: { revokedAt: now },
      });
      throw new UnauthorizedException('Invalid refresh token');
    }

    const nextRawToken = randomBytes(32).toString('base64url');
    const nextTokenHash = this.hashToken(nextRawToken);
    const user = this.toAuthUser(storedToken.user);
    const accessToken = await this.signAccessToken(user);

    const rotated = await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.refreshToken.updateMany({
        where: {
          id: storedToken.id,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { revokedAt: now },
      });

      if (result.count !== 1) {
        return false;
      }

      await transaction.refreshToken.create({
        data: {
          tokenHash: nextTokenHash,
          userId: storedToken.userId,
          expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
        },
      });
      return true;
    });

    if (!rotated) {
      await this.revokeAllRefreshTokens(storedToken.userId);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      user,
      refreshToken: nextRawToken,
    };
  }

  async logout(rawToken?: string): Promise<void> {
    if (!rawToken) {
      return;
    }

    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async createSession(user: User): Promise<AuthTokens> {
    const refreshToken = randomBytes(32).toString('base64url');
    const now = new Date();
    const authUser = this.toAuthUser(user);
    const accessToken = await this.signAccessToken(authUser);

    await this.prisma.refreshToken.create({
      data: {
        tokenHash: this.hashToken(refreshToken),
        userId: user.id,
        expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
      },
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      user: authUser,
      refreshToken,
    };
  }

  private async signAccessToken(user: AuthUser): Promise<string> {
    const payload: AccessTokenPayload = { ...user, sub: user.id };
    return this.jwtService.signAsync(payload);
  }

  private async revokeAllRefreshTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private toAuthUser(user: User): AuthUser {
    return {
      id: user.id,
      email: user.email,
      companyId: user.companyId,
      role: user.role,
    };
  }
}
