import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { DevScopeSessionGuard } from "../auth/devscope-session.guard";
import { AIInsightService } from "./ai-insight.service";

type GuardedRequest = Request & {
  devScopeUserId?: string;
  devScopeOrganizationId?: string;
};

@Controller("ai-insights")
export class AIInsightController {
  constructor(private readonly service: AIInsightService) {}

  @Get("repositories/:repositoryId")
  @UseGuards(DevScopeSessionGuard)
  async get(
    @Req() request: GuardedRequest,
    @Param("repositoryId") repositoryId: string,
  ) {
    return this.service.getOrGenerate(this.requireContext(request), repositoryId, false);
  }

  @Post("repositories/:repositoryId/regenerate")
  @UseGuards(DevScopeSessionGuard)
  async regenerate(
    @Req() request: GuardedRequest,
    @Param("repositoryId") repositoryId: string,
  ) {
    return this.service.getOrGenerate(this.requireContext(request), repositoryId, true);
  }

  private requireContext(request: GuardedRequest) {
    if (!request.devScopeUserId || !request.devScopeOrganizationId) {
      throw new BadRequestException("DevScope workspace context is missing");
    }
    return {
      userId: request.devScopeUserId,
      organizationId: request.devScopeOrganizationId,
    };
  }
}
