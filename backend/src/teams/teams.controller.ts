import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../generated/prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AddTeamMemberDto } from './dto/add-team-member.dto';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { TeamsService } from './teams.service';

@ApiTags('teams')
@ApiBearerAuth()
@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  findMany(@CurrentUser() actor: AuthUser) {
    return this.teamsService.findMany(actor.companyId);
  }

  @Get(':id')
  findOne(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.teamsService.findOne(actor.companyId, id);
  }

  @Post()
  @Roles(UserRole.COMPANY_ADMIN)
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateTeamDto) {
    return this.teamsService.create(actor, dto);
  }

  @Patch(':id')
  @Roles(UserRole.COMPANY_ADMIN)
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTeamDto,
  ) {
    return this.teamsService.update(actor, id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.COMPANY_ADMIN)
  remove(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.teamsService.remove(actor.companyId, id);
  }

  @Post(':id/members')
  @Roles(UserRole.COMPANY_ADMIN, UserRole.MANAGER)
  addMember(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddTeamMemberDto,
  ) {
    return this.teamsService.addMember(actor, id, dto.userId);
  }

  @Delete(':id/members/:userId')
  @Roles(UserRole.COMPANY_ADMIN, UserRole.MANAGER)
  removeMember(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.teamsService.removeMember(actor, id, userId);
  }
}
