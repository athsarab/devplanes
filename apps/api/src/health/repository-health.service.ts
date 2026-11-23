import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { GitHubConfigService } from "../github/github-config.service";
import { BillingService } from "../billing/billing.service";
import {
  REPOSITORY_HEALTH_CONFIG,
  RepositoryHealthConfig,
} from "./repository-health.config";
import {
  RepositoryHealthEngine,
  RepositoryHealthInput,
  RepositoryHealthResult,
} from "./repository-health.engine";

type Context = { userId: string; organizationId: string };
type HealthOctokit = {
  paginate: (route: string, parameters?: Record<string, unknown>) => Promise<any[]>;
  request: (route: string, parameters?: Record<string, unknown>) => Promise<{ data: any }>;
};

@Injectable()
export class RepositoryHealthService {
  private readonly logger = new Logger(RepositoryHealthService.name);
  private readonly engine = new RepositoryHealthEngine(REPOSITORY_HEALTH_CONFIG);
  private readonly cache = new Map<string, { expiresAt: number; value: RepositoryHealthResult }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly github: GitHubConfigService,
    private readonly billing: BillingService,
  ) {}

  getConfiguration() {
    return {
      weights: REPOSITORY_HEALTH_CONFIG.weights,
      thresholds: REPOSITORY_HEALTH_CONFIG.thresholds,
      categoryBoundaries: REPOSITORY_HEALTH_CONFIG.categoryBoundaries,
      minimumHistoryDays: REPOSITORY_HEALTH_CONFIG.minimumHistoryDays,
      categories: {
        Excellent: `Score >= ${REPOSITORY_HEALTH_CONFIG.categoryBoundaries.excellent}`,
        Good: `Score >= ${REPOSITORY_HEALTH_CONFIG.categoryBoundaries.good} and < ${REPOSITORY_HEALTH_CONFIG.categoryBoundaries.excellent}`,
        "Needs Attention": `Score >= ${REPOSITORY_HEALTH_CONFIG.categoryBoundaries.needsAttention} and < ${REPOSITORY_HEALTH_CONFIG.categoryBoundaries.good}`,
        Critical: `Score < ${REPOSITORY_HEALTH_CONFIG.categoryBoundaries.needsAttention}`,
      },
    };
  }

  async getSummary(context: Context) {
    await this.billing.requireFeature(context.organizationId, "repositoryHealth");
    const repositories = await this.prisma.connectedRepository.findMany({
      where: {
        disconnectedAt: null,
        installation: {
          organizationId: context.organizationId,
          status: "ACTIVE",
        },
      },
      include: {
        healthSnapshots: {
          orderBy: { calculatedAt: "desc" },
          take: 1,
        },
      },
      orderBy: { fullName: "asc" },
    });

    return {
      calculatedAt: new Date().toISOString(),
      repositories: await Promise.all(repositories.map(async (repository) => {
        const snapshot = repository.healthSnapshots[0];
        if (!snapshot) {
          const result = await this.calculateRepository(context, repository.id);
          return this.toSummary(repository, result);
        }
        return this.toSummary(repository, {
          overallScore: snapshot.overallScore,
          category: snapshot.category as "Excellent" | "Good" | "Needs Attention" | "Critical",
          calculatedAt: snapshot.calculatedAt.toISOString(),
          dataCompleteness: snapshot.dataCompleteness as RepositoryHealthResult["dataCompleteness"],
          dimensions: snapshot.dimensions as unknown as RepositoryHealthResult["dimensions"],
          positiveFactors: snapshot.positiveFactors as unknown as string[],
          negativeFactors: snapshot.negativeFactors as unknown as string[],
          evidence: snapshot.evidence as unknown as RepositoryHealthResult["evidence"],
          recommendations: snapshot.recommendations as unknown as string[],
        });
      })),
    };
  }

  async getRepositoryHealth(context: Context, repositoryId: string) {
    await this.billing.requireFeature(context.organizationId, "repositoryHealth");
    const repository = await this.findAuthorizedRepository(context, repositoryId);
    const cacheKey = `${context.organizationId}:${repository.id}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return this.toDetail(repository, cached.value);
    }
    const result = await this.calculateRepository(context, repository.id);
    this.cache.set(cacheKey, { expiresAt: Date.now() + 5 * 60 * 1000, value: result });
    return this.toDetail(repository, result);
  }

  async getHistory(context: Context, repositoryId: string) {
    await this.billing.requireFeature(context.organizationId, "repositoryHealth");
    await this.findAuthorizedRepository(context, repositoryId);
    const entitlements = await this.billing.getEffectiveEntitlements(context.organizationId);
    const start = new Date(Date.now() - entitlements.historicalDays * 86_400_000);
    const snapshots = await this.prisma.repositoryHealthSnapshot.findMany({
      where: {
        repositoryId,
        calculatedAt: { gte: start },
      },
      orderBy: { calculatedAt: "asc" },
    });
    return {
      repositoryId,
      periodStart: start.toISOString(),
      periodEnd: new Date().toISOString(),
      history: snapshots.map((snapshot) => ({
        overallScore: snapshot.overallScore,
        category: snapshot.category,
        calculatedAt: snapshot.calculatedAt.toISOString(),
        dataCompleteness: snapshot.dataCompleteness,
      })),
    };
  }

  async getBreakdown(context: Context, repositoryId: string) {
    await this.billing.requireFeature(context.organizationId, "repositoryHealth");
    const repository = await this.findAuthorizedRepository(context, repositoryId);
    const result = await this.calculateRepository(context, repository.id);
    return {
      repositoryId,
      repositoryName: repository.fullName,
      overallScore: result.overallScore,
      category: result.category,
      dimensions: result.dimensions,
      positiveFactors: result.positiveFactors,
      negativeFactors: result.negativeFactors,
      evidence: result.evidence,
      recommendations: result.recommendations,
      calculatedAt: result.calculatedAt,
      dataCompleteness: result.dataCompleteness,
      weights: REPOSITORY_HEALTH_CONFIG.weights,
    };
  }

  private async calculateRepository(context: Context, repositoryId: string) {
    const repository = await this.findAuthorizedRepository(context, repositoryId);
    const octokit = await this.github.createApp().getInstallationOctokit(
      Number(repository.installation.installationId),
    ) as unknown as HealthOctokit;

    const now = new Date();
    const currentStart = new Date(now.getTime() - 30 * 86_400_000);
    const previousStart = new Date(now.getTime() - 60 * 86_400_000);

    let metadataAvailable = true;
    let archived = repository.isArchived;
    let pushedAt: string | null = null;
    let issuesAvailable = true;
    let pullsAvailable = true;
    let commitsAvailable = true;

    try {
      const metadata = await octokit.request(
        "GET /repos/{owner}/{repo}",
        { owner: repository.owner, repo: repository.name },
      );
      archived = Boolean((metadata.data as { archived?: boolean }).archived);
      pushedAt = typeof (metadata.data as { pushed_at?: string }).pushed_at === "string"
        ? (metadata.data as { pushed_at: string }).pushed_at
        : null;
    } catch (error) {
      metadataAvailable = false;
      this.logger.warn(`Repository metadata unavailable: ${this.safeMessage(error)}`);
    }

    let commitsCurrent: Array<{ commit: { author?: { date?: string } } }> = [];
    let commitsPrevious: Array<{ commit: { author?: { date?: string } } }> = [];
    try {
      commitsCurrent = await octokit.paginate(
        "GET /repos/{owner}/{repo}/commits",
        {
          owner: repository.owner,
          repo: repository.name,
          since: currentStart.toISOString(),
          until: now.toISOString(),
          per_page: 100,
        },
      ) as unknown as Array<{ commit: { author?: { date?: string } } }>;
      commitsPrevious = await octokit.paginate(
        "GET /repos/{owner}/{repo}/commits",
        {
          owner: repository.owner,
          repo: repository.name,
          since: previousStart.toISOString(),
          until: currentStart.toISOString(),
          per_page: 100,
        },
      ) as unknown as Array<{ commit: { author?: { date?: string } } }>;
    } catch (error) {
      commitsAvailable = false;
      this.logger.warn(`Commit history unavailable: ${this.safeMessage(error)}`);
    }

    let issues: Array<Record<string, unknown>> = [];
    try {
      const issueData = await octokit.paginate(
        "GET /repos/{owner}/{repo}/issues",
        {
          owner: repository.owner,
          repo: repository.name,
          state: "all",
          sort: "updated",
          direction: "desc",
          per_page: 100,
        },
      );
      issues = issueData
        .filter((issue) => !("pull_request" in issue))
        .map((issue) => issue as unknown as Record<string, unknown>);
    } catch (error) {
      issuesAvailable = false;
      this.logger.warn(`Issue history unavailable: ${this.safeMessage(error)}`);
    }

    let pulls: Array<Record<string, unknown>> = [];
    try {
      pulls = await octokit.paginate(
        "GET /repos/{owner}/{repo}/pulls",
        {
          owner: repository.owner,
          repo: repository.name,
          state: "all",
          sort: "updated",
          direction: "desc",
          per_page: 100,
        },
      ) as unknown as Array<Record<string, unknown>>;
    } catch (error) {
      pullsAvailable = false;
      this.logger.warn(`Pull request history unavailable: ${this.safeMessage(error)}`);
    }

    const openIssues = issuesAvailable
      ? issues.filter((issue) => issue.state === "open")
      : null;
    const openPulls = pullsAvailable
      ? pulls.filter((pull) => pull.state === "open")
      : null;

    const oldIssueThreshold = new Date(
      now.getTime() - REPOSITORY_HEALTH_CONFIG.thresholds.issues.oldDays * 86_400_000,
    );
    const inactiveIssueThreshold = new Date(
      now.getTime() - REPOSITORY_HEALTH_CONFIG.thresholds.issues.inactiveDays * 86_400_000,
    );
    const stalePullThreshold = new Date(
      now.getTime() - REPOSITORY_HEALTH_CONFIG.thresholds.pullRequests.staleDays * 86_400_000,
    );

    const oldIssues = openIssues?.filter((issue) =>
      this.dateBefore(issue.created_at, oldIssueThreshold)).length ?? null;
    const unassignedIssues = openIssues?.filter((issue) =>
      !Array.isArray(issue.assignees) || issue.assignees.length === 0).length ?? null;
    const inactiveIssues = openIssues?.filter((issue) =>
      this.dateBefore(issue.updated_at, inactiveIssueThreshold)).length ?? null;
    const resolvedCurrent = issuesAvailable
      ? issues.filter((issue) =>
          issue.state === "closed" &&
          this.dateInRange(issue.closed_at, currentStart, now)).length
      : null;
    const resolvedPrevious = issuesAvailable
      ? issues.filter((issue) =>
          issue.state === "closed" &&
          this.dateInRange(issue.closed_at, previousStart, currentStart)).length
      : null;

    const stalePulls = openPulls?.filter((pull) =>
      this.dateBefore(pull.updated_at, stalePullThreshold)).length ?? null;
    const mergedCurrent = pullsAvailable
      ? pulls.filter((pull) =>
          Boolean(pull.merged_at) &&
          this.dateInRange(pull.merged_at, currentStart, now)).length
      : null;
    const mergedPrevious = pullsAvailable
      ? pulls.filter((pull) =>
          Boolean(pull.merged_at) &&
          this.dateInRange(pull.merged_at, previousStart, currentStart)).length
      : null;

    let waitingForReview: number | null = pullsAvailable ? 0 : null;
    let waitingForChanges: number | null = pullsAvailable ? 0 : null;
    const turnaroundDays: number[] = [];
    if (pullsAvailable && openPulls) {
      for (const pull of openPulls.slice(0, 30)) {
        const number = typeof pull.number === "number" ? pull.number : null;
        if (!number) continue;
        try {
          const reviews = await octokit.paginate(
            "GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews",
            {
              owner: repository.owner,
              repo: repository.name,
              pull_number: number,
              per_page: 100,
            },
          );
          const submitted = reviews
            .filter((review) => typeof review.submitted_at === "string")
            .sort((left, right) =>
              String(left.submitted_at).localeCompare(String(right.submitted_at)));
          const latest = submitted.at(-1);
          if (latest?.state === "CHANGES_REQUESTED") {
            waitingForChanges = (waitingForChanges ?? 0) + 1;
          } else if (!latest || latest.state === "PENDING") {
            waitingForReview = (waitingForReview ?? 0) + 1;
          } else if (latest.state === "APPROVED") {
            const turnaround = this.dateDifference(pull.created_at, latest.submitted_at);
            if (turnaround !== null) turnaroundDays.push(turnaround);
          }
        } catch (error) {
          waitingForReview = null;
          waitingForChanges = null;
          this.logger.warn(`Review state unavailable: ${this.safeMessage(error)}`);
          break;
        }
      }
    }

    const reviewTurnaround = turnaroundDays.length > 0
      ? this.median(turnaroundDays)
      : openPulls && openPulls.length > 0 ? null : 0;

    const commitDates = commitsAvailable
      ? commitsCurrent
          .map((commit) => this.parseDate(commit.commit.author?.date))
          .filter((date): date is Date => date !== null)
      : [];
    const lastCommitAt = commitDates.length > 0
      ? new Date(Math.max(...commitDates.map((date) => date.getTime())))
      : null;
    const activityDates = [
      pushedAt ? this.parseDate(pushedAt) : null,
      lastCommitAt,
    ].filter((date): date is Date => date !== null);
    const lastActivityAt = activityDates.length > 0
      ? new Date(Math.max(...activityDates.map((date) => date.getTime())))
      : null;

    const input: RepositoryHealthInput = {
      calculatedAt: now,
      archived,
      metadataAvailable,
      lastCommitAt,
      lastActivityAt,
      commitsCurrentPeriod: commitsAvailable ? commitsCurrent.length : null,
      commitsPreviousPeriod: commitsAvailable ? commitsPrevious.length : null,
      openIssues: openIssues?.length ?? null,
      oldIssues,
      unassignedIssues,
      inactiveIssues,
      resolvedIssuesCurrentPeriod: resolvedCurrent,
      resolvedIssuesPreviousPeriod: resolvedPrevious,
      openPullRequests: openPulls?.length ?? null,
      stalePullRequests: stalePulls,
      waitingForReviewPullRequests: waitingForReview,
      waitingForChangesPullRequests: waitingForChanges,
      mergedPullRequestsCurrentPeriod: mergedCurrent,
      mergedPullRequestsPreviousPeriod: mergedPrevious,
      reviewTurnaroundDays: reviewTurnaround,
    };

    const result = this.engine.calculate(input);
    await this.storeSnapshot(repository.id, result);
    return result;
  }

  private async findAuthorizedRepository(context: Context, repositoryId: string) {
    const repository = await this.prisma.connectedRepository.findFirst({
      where: {
        id: repositoryId,
        disconnectedAt: null,
        installation: {
          organizationId: context.organizationId,
          status: "ACTIVE",
        },
      },
      include: {
        installation: {
          select: { installationId: true },
        },
      },
    });
    if (!repository) throw new NotFoundException("Connected repository was not found");
    return repository;
  }

  private async storeSnapshot(repositoryId: string, result: RepositoryHealthResult) {
    await this.prisma.repositoryHealthSnapshot.create({
      data: {
        repositoryId,
        overallScore: result.overallScore,
        category: result.category,
        dimensions: result.dimensions as unknown as Prisma.JsonArray,
        positiveFactors: result.positiveFactors as Prisma.JsonArray,
        negativeFactors: result.negativeFactors as Prisma.JsonArray,
        evidence: result.evidence as unknown as Prisma.JsonArray,
        recommendations: result.recommendations as Prisma.JsonArray,
        dataCompleteness: result.dataCompleteness as unknown as Prisma.JsonObject,
        calculatedAt: new Date(result.calculatedAt),
      },
    });
  }

  private toSummary(repository: { id: string; fullName: string; isArchived: boolean }, result: RepositoryHealthResult) {
    return {
      repositoryId: repository.id,
      repositoryName: repository.fullName,
      isArchived: repository.isArchived,
      overallScore: result.overallScore,
      category: result.category,
      dataCompleteness: result.dataCompleteness,
      calculatedAt: result.calculatedAt,
    };
  }

  private toDetail(repository: {
    id: string;
    fullName: string;
    description: string | null;
    visibility: string;
    defaultBranch: string | null;
    primaryLanguage: string | null;
    isArchived: boolean;
  }, result: RepositoryHealthResult) {
    return {
      repositoryId: repository.id,
      repositoryName: repository.fullName,
      description: repository.description,
      visibility: repository.visibility,
      defaultBranch: repository.defaultBranch,
      primaryLanguage: repository.primaryLanguage,
      isArchived: repository.isArchived,
      ...result,
    };
  }

  private parseDate(value: unknown): Date | null {
    if (typeof value !== "string" || !value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private dateBefore(value: unknown, threshold: Date): boolean {
    const date = this.parseDate(value);
    return Boolean(date && date < threshold);
  }

  private dateInRange(value: unknown, start: Date, end: Date): boolean {
    const date = this.parseDate(value);
    return Boolean(date && date >= start && date <= end);
  }

  private dateDifference(start: unknown, end: unknown): number | null {
    const startDate = this.parseDate(start);
    const endDate = this.parseDate(end);
    if (!startDate || !endDate) return null;
    return Math.max(0, (endDate.getTime() - startDate.getTime()) / 86_400_000);
  }

  private median(values: number[]) {
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) return Math.round(sorted[middle] * 10) / 10;
    return Math.round(((sorted[middle - 1] + sorted[middle]) / 2) * 10) / 10;
  }

  private safeMessage(error: unknown): string {
    if (typeof error === "object" && error) {
      const status = Number((error as { status?: number }).status);
      if (status === 403) return "GitHub access restriction";
      if (status === 404) return "Repository not found";
      if (status === 429) return "GitHub rate limit";
    }
    return "GitHub request failed";
  }
}
