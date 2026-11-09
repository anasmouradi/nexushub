import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, MaxLength } from 'class-validator';
import { UserRole } from '../../../generated/prisma/client';
import { normalizeEmail } from '../../auth/dto/normalize-email';

export class CreateInvitationDto {
  @Transform(({ value }) => normalizeEmail(value))
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsEnum(UserRole)
  role!: UserRole;
}
