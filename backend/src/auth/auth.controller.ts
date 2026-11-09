import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { REFRESH_COOKIE_NAME, REFRESH_TOKEN_TTL_MS } from './auth.constants';
import { AuthService, AuthTokens } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import type { AuthUser } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const REFRESH_COOKIE_PATH = '/api/auth';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto): Promise<AuthUser> {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const tokens = await this.authService.login(dto);
    this.setRefreshCookie(response, tokens);
    return this.withoutRefreshToken(tokens);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const tokens = await this.authService.refresh(
      this.getRefreshToken(request),
    );
    this.setRefreshCookie(response, tokens);
    return this.withoutRefreshToken(tokens);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logout(this.getRefreshToken(request));
    response.clearCookie(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      secure: this.configService.get('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
    });
    return { status: 'ok' };
  }

  @Get('me')
  @ApiBearerAuth()
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }

  private setRefreshCookie(response: Response, tokens: AuthTokens): void {
    response.cookie(REFRESH_COOKIE_NAME, tokens.refreshToken, {
      httpOnly: true,
      secure: this.configService.get('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
      maxAge: REFRESH_TOKEN_TTL_MS,
    });
  }

  private getRefreshToken(request: Request): string | undefined {
    const cookies = request.cookies as Record<string, unknown> | undefined;
    const token = cookies?.[REFRESH_COOKIE_NAME];
    return typeof token === 'string' ? token : undefined;
  }

  private withoutRefreshToken({
    accessToken,
    tokenType,
    expiresIn,
    user,
  }: AuthTokens) {
    return { accessToken, tokenType, expiresIn, user };
  }
}
