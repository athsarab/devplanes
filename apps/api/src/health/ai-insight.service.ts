import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RepositoryHealthService } from "./repository-health.service";
import { BottleneckService } from "./bottleneck.service";
import { BillingService } from "../billing/billing.service";
import { AI_INSIGHT_PROVIDER } from "./ai-insight.provider";
import type { AIInsightProviderPort } from "./ai-insight.provider";
import { AIInsightOutput, validateAIInsightOutput } from "./ai-insight.validator";

type Context = { userId: string; organizationId: string };

@Injectable()
export class AIInsightService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly health: RepositoryHealthService,
    private readonly bottlenecks: BottleneckService,
    private readonly billing: BillingService,
    @Inject(AI_INSIGHT_PROVIDER)
    private readonly provider: AIInsightProviderPort,
  ) {}

  async getOrGenerate(context: Context, repositoryId: string, regenerate = false) {
    await this.billing.requireFeature(context.organizationId, "advancedAnalytics");
    const repository = await this.prisma.connectedRepository.findFirst({
      where: {
        id: repositoryId,
        disconnectedAt: null,
        installation: {
          organizationId: context.organizationId,
          status: "ACTIVE",
        },
      },
    });
    if (!repository) throw new NotFoundException("Connected repository was not found");

    const insightContext = await this.buildContext(context, repository);
    const contextHash = createHash("sha256")
      .update(JSON.stringify(insightContext))
      .digest("hex");

    if (!regenerate) {
      const cached = await this.prisma.aIInsightRecord.findUnique({
        where: {
          organizationId_repositoryId_contextHash: {
            organizationId: context.organizationId,
            repositoryId,
            contextHash,
          },
        },
      });
      if (cached) {
        return this.formatRecord(repository, cached.output, cached.evidenceIds, cached, true);
      }
    }

    const enabled = this.config.get<string>("AI_ENABLED") === "true";
    if (!enabled) {
      const output: AIInsightOutput = {
        summary: "AI insights are disabled in this environment.",
        keyObservations: [],
        supportingEvidenceReferences: [],
        potentialRisks: [],
        recommendedActions: [],
        confidenceOrDataCompleteness:
          "AI cannot determine additional insights while AI is disabled. Backend-calculated metrics remain available.",
      };
      return this.store(context, repository, insightContext, contextHash, {
        provider: "disabled",
        model: "none",
        output,
      });
    }

    const allowedEvidenceIds = new Set(
      insightContext.evidence.map((item: { id: string }) => item.id),
    );
    const systemPrompt = [
      "You are an evidence interpreter for repository engineering analytics.",
      "Use only supplied verified metrics.",
      "Never invent commits, issues, pull requests, review times, developer performance, or code facts.",
      "Do not identify or blame individuals.",
      "If evidence is insufficient, explicitly say it cannot be determined.",
      "Return strict JSON with summary, keyObservations, supportingEvidenceReferences, potentialRisks, recommendedActions, confidenceOrDataCompleteness.",
      "Every key observation, risk, and recommended action must contain text and evidenceIds.",
      "Evidence IDs must match supplied IDs exactly.",
    ].join(" ");

    let output: AIInsightOutput;
    try {
      const generated = await this.provider.generate({
        systemPrompt,
        userPrompt: JSON.stringify(insightContext),
      });
      output = validateAIInsightOutput(generated, allowedEvidenceIds);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new BadRequestException(
        error instanceof Error ? `AI output rejected: ${error.message}` : "AI output rejected",
      );
    }

    return this.store(context, repository, insightContext, contextHash, {
      provider: this.provider.providerName,
      model: this.provider.modelName,
      output,
    });
  }

  private async buildContext(context: Context, repository: {
    id: string;
    fullName: string;
  }) {
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 86_400_000);
    const previousStart = new Date(end.getTime() - 60 * 86_400_000);
    const [health, bottlenecks, history] = await Promise.all([
      this.health.getBreakdown(context, repository.id),
      this.bottlenecks.getRepository(context, repository.id, {
        repositoryId: repository.id,
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
      }),
      this.health.getHistory(context, repository.id),
    ]);

    const evidence: Array<{
      id: string;
      type: string;
      value: unknown;
      source: "backend_health" | "backend_bottleneck";
    }> = [];
    for (const item of health.evidence) {
      evidence.push({
        id: `health.${item.code}`,
        type: item.label,
        value: item.available ? item.value : "unavailable",
        source: "backend_health",
      });
    }
    for (const finding of bottlenecks.findings) {
      evidence.push({
        id: `bottleneck.${finding.findingType}.${finding.referenceNumber ?? "repository"}`,
        type: finding.findingType,
        value: finding.evidence,
        source: "backend_bottleneck",
      });
    }

    const prior = history.history
      .filter((item) =>
        new Date(item.calculatedAt) >= previousStart &&
        new Date(item.calculatedAt) < start,
      )
      .at(-1);
    const latest = history.history.at(-1);

    return {
      repository: {
        id: repository.id,
        name: repository.fullName,
        githubUrl: `https://github.com/${repository.fullName}`,
      },
      reportingPeriod: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
      verifiedMetrics: {
        healthScore: health.overallScore,
        healthCategory: health.category,
        healthDimensions: health.dimensions.map((dimension) => ({
          key: dimension.key,
          score: dimension.score,
          weight: dimension.weight,
        })),
        bottleneckMetrics: bottlenecks.metrics,
      },
      previousPeriodComparison:
        prior && latest
          ? {
              available: true,
              previousHealthScore: prior.overallScore,
              previousCalculatedAt: prior.calculatedAt,
              latestHealthScore: latest.overallScore,
              latestCalculatedAt: latest.calculatedAt,
            }
          : { available: false },
      bottleneckFindings: bottlenecks.findings.map((finding) => ({
        findingType: finding.findingType,
        severity: finding.severity,
        referenceType: finding.referenceType,
        referenceNumber: finding.referenceNumber,
        evidenceId:
          `bottleneck.${finding.findingType}.${finding.referenceNumber ?? "repository"}`,
        active: finding.active,
        suggestedAction: finding.suggestedAction,
      })),
      dataCompleteness: health.dataCompleteness,
      evidence,
    };
  }

  private async store(
    context: Context,
    repository: { id: string; fullName: string },
    insightContext: unknown,
    contextHash: string,
    generated: { provider: string; model: string; output: AIInsightOutput },
  ) {
    const reporting = (insightContext as {
      reportingPeriod: { start: string; end: string };
    }).reportingPeriod;
    const evidenceIds = (insightContext as {
      evidence: Array<{ id: string }>;
    }).evidence.map((item) => item.id);
    const record = await this.prisma.aIInsightRecord.upsert({
      where: {
        organizationId_repositoryId_contextHash: {
          organizationId: context.organizationId,
          repositoryId: repository.id,
          contextHash,
        },
      },
      create: {
        organizationId: context.organizationId,
        repositoryId: repository.id,
        reportingStart: new Date(reporting.start),
        reportingEnd: new Date(reporting.end),
        contextHash,
        provider: generated.provider,
        model: generated.model,
        output: generated.output as unknown as Prisma.JsonObject,
        evidenceIds: evidenceIds as Prisma.JsonArray,
        generatedAt: new Date(),
      },
      update: {
        provider: generated.provider,
        model: generated.model,
        output: generated.output as unknown as Prisma.JsonObject,
        evidenceIds: evidenceIds as Prisma.JsonArray,
        generatedAt: new Date(),
      },
    });
    return this.formatRecord(repository, record.output, record.evidenceIds, record, false);
  }

  private formatRecord(
    repository: { id: string; fullName: string },
    output: unknown,
    evidenceIds: unknown,
    record: { generatedAt: Date; provider: string; model: string },
    cached: boolean,
  ) {
    return {
      repositoryId: repository.id,
      repositoryName: repository.fullName,
      generatedAt: record.generatedAt.toISOString(),
      provider: record.provider,
      model: record.model,
      cached,
      output,
      evidenceIds,
    };
  }
}
