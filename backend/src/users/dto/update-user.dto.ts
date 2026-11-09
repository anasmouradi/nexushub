import { IsBoolean, IsEnum, ValidateIf } from 'class-validator';
import { UserRole } from '../../../generated/prisma/client';
import { UpdateProfileDto } from './update-profile.dto';

export class UpdateUserDto extends UpdateProfileDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(UserRole)
  role?: UserRole;

  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}
