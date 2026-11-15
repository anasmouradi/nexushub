import { IsUUID } from 'class-validator';

export class AddProjectMemberDto {
  @IsUUID()
  userId!: string;
}
