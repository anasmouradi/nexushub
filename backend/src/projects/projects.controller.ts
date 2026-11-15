import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../generated/prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AddProjectMemberDto } from './dto/add-project-member.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { ListProjectsDto } from './dto/list-projects.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';

@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  findMany(@CurrentUser() actor: AuthUser, @Query() query: ListProjectsDto) {
    return this.projectsService.findMany(actor, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.projectsService.findOne(actor, id);
  }

  @Post()
  @Roles(UserRole.COMPANY_ADMIN, UserRole.MANAGER)
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateProjectDto) {
    return this.projectsService.create(actor, dto);
  }

  @Patch(':id')
  @Roles(UserRole.COMPANY_ADMIN, UserRole.MANAGER)
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectsService.update(actor, id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.COMPANY_ADMIN)
  remove(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.projectsService.remove(actor, id);
  }

  @Post(':id/members')
  @Roles(UserRole.COMPANY_ADMIN, UserRole.MANAGER)
  addMember(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddProjectMemberDto,
  ) {
    return this.projectsService.addMember(actor, id, dto.userId);
  }

  @Delete(':id/members/:userId')
  @Roles(UserRole.COMPANY_ADMIN, UserRole.MANAGER)
  removeMember(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.projectsService.removeMember(actor, id, userId);
  }
}
