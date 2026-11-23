import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { RepositoryHealthController } from "./repository-health.controller";
import { RepositoryHealthService } from "./repository-health.service";
import { DevScopeSessionGuard } from "../auth/devscope-session.guard";
import { BillingModule } from "../billing/billing.module";
import { GitHubModule } from "../github/github.module";
import { BottleneckController } from "./bottleneck.controller";
import { BottleneckService } from "./bottleneck.service";
import { AIInsightController } from "./ai-insight.controller";
import { AIInsightService } from "./ai-insight.service";
import { AI_INSIGHT_PROVIDER } from "./ai-insight.provider";
import { OpenAIInsightProvider } from "./openai-insight.provider";

@Module({
  imports: [BillingModule, GitHubModule],
  controllers: [HealthController, RepositoryHealthController, BottleneckController, AIInsightController],
  providers: [
    RepositoryHealthService,
    BottleneckService,
    AIInsightService,
    OpenAIInsightProvider,
    {
      provide: AI_INSIGHT_PROVIDER,
      useExisting: OpenAIInsightProvider,
    },
    DevScopeSessionGuard,
  ],
  exports: [RepositoryHealthService, BottleneckService],
})
export class HealthModule {}
