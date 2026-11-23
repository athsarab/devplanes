import {
  Controller,
  Get,
  Param,
  Req,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import type { Request } from "express";
import { DevScopeSessionGuard } from "../auth/devscope-session.guard";
import { RepositoryHealthService } from "./repository-health.service";

type GuardedRequest = Request & {
  devScopeUserId?: string;
  devScopeOrganizationId?: string;
};

@Controller("health/repositories")
export class RepositoryHealthController {
  constructor(private readonly service: RepositoryHealthService) {}

  @Get()
  @UseGuards(DevScopeSessionGuard)
  async summary(@Req() request: GuardedRequest) {
    return this.service.getSummary(this.requireContext(request));
  }

  @Get("configuration")
  @UseGuards(DevScopeSessionGuard)
  async configuration(@Req() _request: GuardedRequest) {
    return this.service.getConfiguration();
  }

  @Get(":repositoryId")
  @UseGuards(DevScopeSessionGuard)
  async details(
    @Req() request: GuardedRequest,
    @Param("repositoryId") repositoryId: string,
  ) {
    return this.service.getRepositoryHealth(this.requireContext(request), repositoryId);
  }

  @Get(":repositoryId/history")
  @UseGuards(DevScopeSessionGuard)
  async history(
    @Req() request: GuardedRequest,
    @Param("repositoryId") repositoryId: string,
  ) {
    return this.service.getHistory(this.requireContext(request), repositoryId);
  }

  @Get(":repositoryId/breakdown")
  @UseGuards(DevScopeSessionGuard)
  async breakdown(
    @Req() request: GuardedRequest,
    @Param("repositoryId") repositoryId: string,
  ) {
    return this.service.getBreakdown(this.requireContext(request), repositoryId);
  }


  private requireContext(request: GuardedRequest) {
    if (!request.devScopeUserId || !request.devScopeOrganizationId) {
      throw new BadRequestException("DevScope workspace context is missing");
    }
    return { userId: request.devScopeUserId, organizationId: request.devScopeOrganizationId };
  }
}
