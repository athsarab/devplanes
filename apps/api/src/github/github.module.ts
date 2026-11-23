import { Module } from "@nestjs/common";
import { DevScopeSessionGuard } from "../auth/devscope-session.guard";
import { GitHubConfigService } from "./github-config.service";
import { GitHubInstallationsService } from "./github-installations.service";
import { GitHubController } from "./github.controller";
import { GitHubAnalyticsService } from "./github-analytics.service";
import { GitHubWebhookService } from "./github-webhook.service";
import { BillingModule } from "../billing/billing.module";

@Module({
  imports: [BillingModule],
  providers: [
    GitHubConfigService,
    GitHubInstallationsService,
    DevScopeSessionGuard,
    GitHubAnalyticsService,
    GitHubWebhookService,
  ],
  controllers: [GitHubController],
  exports: [GitHubInstallationsService, GitHubConfigService],
})
export class GitHubModule {}
