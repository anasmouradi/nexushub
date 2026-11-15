import { Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '../../generated/prisma/client';
import type { AuthUser } from '../auth/auth.types';

@Injectable()
export class ProjectAccessService {
  visibleWhere(actor: AuthUser): Prisma.ProjectWhereInput {
    const companyScope: Prisma.ProjectWhereInput = {
      companyId: actor.companyId,
    };

    if (actor.role === UserRole.COMPANY_ADMIN) return companyScope;
    if (actor.role === UserRole.MANAGER) {
      return {
        ...companyScope,
        OR: [
          { managerId: actor.id },
          { createdById: actor.id },
          { members: { some: { userId: actor.id } } },
        ],
      };
    }

    return {
      ...companyScope,
      members: { some: { userId: actor.id } },
    };
  }
}
