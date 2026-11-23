import {
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { DevScopeSessionGuard } from "../auth/devscope-session.guard";
import { GitHubInstallationsService } from "./github-installations.service";
import { GitHubConfigService } from "./github-config.service";
import { GitHubAnalyticsService } from "./github-analytics.service";
import { GitHubWebhookService } from "./github-webhook.service";

type GuardedRequest = Request & {
  devScopeUserId?: string;
  devScopeOrganizationId?: string;
};

@Controller("github")
export class GitHubController {
  constructor(
    private readonly github: GitHubInstallationsService,
    private readonly config: GitHubConfigService,
    private readonly analyticsService: GitHubAnalyticsService,
    private readonly webhookService: GitHubWebhookService,
  ) {}

  @Get("install/start")
  @UseGuards(DevScopeSessionGuard)
  async start(@Req() request: GuardedRequest) {
    return this.github.startInstallation(this.requireContext(request));
  }

  @Get("configuration")
  @UseGuards(DevScopeSessionGuard)
  async configuration() {
    return this.config.status;
  }

  @Get("install/callback")
  async callback(
    @Query("state") state: string,
    @Query("installation_id") installationId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.github.completeInstallation(
      state,
      installationId,
    );
    void result;
    response.redirect(this.config.webCallbackUrl);
  }

  @Get("installations")
  @UseGuards(DevScopeSessionGuard)
  async installations(@Req() request: GuardedRequest) {
    const result = await this.github.listInstallations(this.requireContext(request));
    return this.serialize(result);
  }

  @Get("repositories")
  @UseGuards(DevScopeSessionGuard)
  async repositories(@Req() request: GuardedRequest) {
    const result = await this.github.listAccessibleRepositories(this.requireContext(request));
    return this.serialize(result);
  }

  @Get("analytics")
  @UseGuards(DevScopeSessionGuard)
  async analytics(
    @Req() request: GuardedRequest,
    @Query("start") start: string,
    @Query("end") end: string,
    @Query("repositoryId") repositoryId: string,
    @Query("category") category: string,
  ) {
    return this.serialize(
      await this.analyticsService.getAnalytics(this.requireContext(request), {
        start,
        end,
        repositoryId,
        category,
      }),
    );
  }

  @Get("intelligence")
  @UseGuards(DevScopeSessionGuard)
  async intelligence(@Req() request: GuardedRequest) {
    return this.serialize(
      await this.webhookService.getRepositoryIntelligence(
        this.requireContext(request),
      ),
    );
  }

  @Post("installations/:installationId/refresh")
  @UseGuards(DevScopeSessionGuard)
  async refresh(
    @Req() request: GuardedRequest,
    @Param("installationId") installationId: string,
  ) {
    const numericId = Number(installationId);
    await this.github.refreshAccessibleRepositories(
      this.requireContext(request),
      numericId,
    );
  }

  @Delete("repositories/:repositoryId")
  @UseGuards(DevScopeSessionGuard)
  async disconnect(
    @Req() request: GuardedRequest,
    @Param("repositoryId") repositoryId: string,
  ) {
    await this.github.disconnectRepository(
      this.requireContext(request),
      repositoryId,
    );
    return { disconnected: true };
  }

  @Post("webhooks")
  async webhook(
    @Req() request: Request & { rawBody?: Buffer },
    @Headers("x-hub-signature-256") signature: string,
    @Headers("x-github-event") event: string,
    @Headers("x-github-delivery") deliveryId: string,
  ) {
    return this.webhookService.enqueue(
      request.rawBody ?? Buffer.from(""),
      signature,
      deliveryId,
      event,
      (request as Request & { body: unknown }).body,
    );
  }

  private requireContext(request: GuardedRequest) {
    if (!request.devScopeUserId || !request.devScopeOrganizationId) {
      throw new Error("DevScope workspace context is missing");
    }
    return {
      userId: request.devScopeUserId,
      organizationId: request.devScopeOrganizationId,
    };
  }

  private serialize<T>(value: T): T {
    return JSON.parse(
      JSON.stringify(value, (_key, item) =>
        typeof item === "bigint" ? item.toString() : item,
      ),
    ) as T;
  }
}
