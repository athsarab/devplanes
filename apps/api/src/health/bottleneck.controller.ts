import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { DevScopeSessionGuard } from "../auth/devscope-session.guard";
import { BottleneckService } from "./bottleneck.service";

type GuardedRequest = Request & {
  devScopeUserId?: string;
  devScopeOrganizationId?: string;
};

@Controller("bottlenecks")
export class BottleneckController {
  constructor(private readonly service: BottleneckService) {}

  @Get("overview")
  @UseGuards(DevScopeSessionGuard)
  async overview(
    @Req() request: GuardedRequest,
    @Query("repositoryId") repositoryId?: string,
    @Query("severity") severity?: string,
    @Query("status") status?: string,
    @Query("start") start?: string,
    @Query("end") end?: string,
  ) {
    return this.service.getOverview(this.requireContext(request), {
      repositoryId,
      severity,
      status,
      start,
      end,
    });
  }

  @Get("repositories/:repositoryId")
  @UseGuards(DevScopeSessionGuard)
  async repository(
    @Req() request: GuardedRequest,
    @Param("repositoryId") repositoryId: string,
    @Query("severity") severity?: string,
    @Query("status") status?: string,
    @Query("start") start?: string,
    @Query("end") end?: string,
  ) {
    return this.service.getRepository(this.requireContext(request), repositoryId, {
      repositoryId,
      severity,
      status,
      start,
      end,
    });
  }

  @Get("pull-requests/:repositoryId/:pullRequestNumber/timeline")
  @UseGuards(DevScopeSessionGuard)
  async timeline(
    @Req() request: GuardedRequest,
    @Param("repositoryId") repositoryId: string,
    @Param("pullRequestNumber", ParseIntPipe) pullRequestNumber: number,
  ) {
    return this.service.getPullRequestTimeline(
      this.requireContext(request),
      repositoryId,
      pullRequestNumber,
    );
  }

  @Get("issues/aging")
  @UseGuards(DevScopeSessionGuard)
  async issueAging(
    @Req() request: GuardedRequest,
    @Query("repositoryId") repositoryId?: string,
    @Query("status") status?: string,
    @Query("start") start?: string,
    @Query("end") end?: string,
  ) {
    return this.service.getIssueAging(this.requireContext(request), {
      repositoryId,
      status,
      start,
      end,
    });
  }

  @Get("history")
  @UseGuards(DevScopeSessionGuard)
  async history(
    @Req() request: GuardedRequest,
    @Query("repositoryId") repositoryId?: string,
    @Query("severity") severity?: string,
    @Query("status") status?: string,
    @Query("start") start?: string,
    @Query("end") end?: string,
  ) {
    return this.service.getHistory(this.requireContext(request), {
      repositoryId,
      severity,
      status,
      start,
      end,
    });
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
