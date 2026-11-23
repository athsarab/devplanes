import { Module } from "@nestjs/common";
import { GitHubConfigService } from "./github-config.service";
import { GitHubInstallationsService } from "./github-installations.service";
import { GitHubController } from "./github.controller";
import { GitHubAnalyticsService } from "./github-analytics.service";
import { GitHubWebhookService } from "./github-webhook.service";
import { BillingModule } from "../billing/billing.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [BillingModule, AuthModule],
  providers: [
    GitHubConfigService,
    GitHubInstallationsService,
    GitHubAnalyticsService,
    GitHubWebhookService,
  ],
  controllers: [GitHubController],
  exports: [GitHubInstallationsService, GitHubConfigService],
})
export class GitHubModule {}
