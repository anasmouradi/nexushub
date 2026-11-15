import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { TaskStatus } from '../../../generated/prisma/client';

export class MoveTaskDto {
  @IsEnum(TaskStatus)
  status!: TaskStatus;

  @IsOptional()
  @IsUUID()
  beforeId?: string;

  @IsOptional()
  @IsUUID()
  afterId?: string;
}
