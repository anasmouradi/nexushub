import type { UserRole } from '../../generated/prisma/client';

export interface AuthUser {
  id: string;
  email: string;
  companyId: string;
  role: UserRole;
}

export interface AccessTokenPayload extends AuthUser {
  sub: string;
}
