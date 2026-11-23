import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { GitHubConfigService } from "../github/github-config.service";
import {
  BottleneckEngine,
  LifecycleEvent,
  PullRequestInput,
  IssueInput,
  BottleneckFindingInput,
} from "./bottleneck.engine";
import { BOTTLENECK_CONFIG } from "./bottleneck.config";

type Context = { userId: string; organizationId: string };

type BottleneckFilters = {
  repositoryId?: string;
  severity?: string;
  status?: string;
  start?: string;
  end?: string;
};

@Injectable()
export class BottleneckService {
  private readonly engine = new BottleneckEngine(BOTTLENECK_CONFIG);

  constructor(
    private readonly prisma: PrismaService,
    private readonly github: GitHubConfigService,
  ) {}

  async getOverview(context: Context, filters: BottleneckFilters) {
    const { repositories, result } = await this.calculate(context, filters);
    return {
      calculatedAt: result.calculatedAt,
      metrics: result.metrics,
      repositories: repositories.map((repository) => repository.fullName),
      incompleteHistory: result.incompleteHistory,
      findings: this.filterFindings(
        result.findings,
        repositories,
        filters,
      ).map((finding) => this.withDetectedTimestamp(finding, result.calculatedAt)),
    };
  }

  async getRepository(context: Context, repositoryId: string, filters: BottleneckFilters) {
    if (!repositoryId) throw new BadRequestException("Repository ID is required");
    await this.findAuthorizedRepository(context, repositoryId);
    const response = await this.calculate(context, { ...filters, repositoryId });
    const repository = response.repositories.find((item) => item.id === repositoryId);
    return {
      repositoryId,
      repositoryName: repository?.fullName ?? null,
      calculatedAt: response.result.calculatedAt,
      metrics: response.result.metrics,
      incompleteHistory: response.result.incompleteHistory,
      findings: this.filterFindings(
        response.result.findings,
        response.repositories,
        filters,
      ).map((finding) => this.withDetectedTimestamp(finding, response.result.calculatedAt)),
    };
  }

  async getPullRequestTimeline(
    context: Context,
    repositoryId: string,
    pullRequestNumber: number,
  ) {
    if (!Number.isSafeInteger(pullRequestNumber) || pullRequestNumber <= 0) {
      throw new BadRequestException("Invalid pull request number");
    }
    const repository = await this.findAuthorizedRepository(context, repositoryId);
    const snapshot = await this.prisma.gitHubPullRequestSnapshot.findFirst({
      where: { repositoryId, number: pullRequestNumber },
    });
    if (!snapshot) {
      throw new NotFoundException("Pull request snapshot was not found");
    }

    const stored = await this.prisma.pullRequestLifecycleEvent.findMany({
      where: { repositoryId, pullRequestNumber },
      orderBy: { occurredAt: "asc" },
    });
    const timeline: Array<{
      eventType: string;
      occurredAt: string;
      source: string;
      available: boolean;
      metadata: unknown;
    }> = stored.map((event) => ({
      eventType: event.eventType,
      occurredAt: event.occurredAt.toISOString(),
      source: event.sourceDeliveryId.startsWith("api:")
        ? "GitHub API"
        : "GitHub webhook",
      available: true,
      metadata: event.metadata,
    }));

    let branchDeleted: boolean | null = null;
    try {
      const octokit = await this.github.createApp().getInstallationOctokit(
        Number(repository.installation.installationId),
      ) as unknown as {
        request: (route: string, parameters: Record<string, unknown>) => Promise<{ data: any }>;
        paginate: (route: string, parameters: Record<string, unknown>) => Promise<any[]>;
      };
      const pull = await octokit.request(
        "GET /repos/{owner}/{repo}/pulls/{pull_number}",
        {
          owner: repository.owner,
          repo: repository.name,
          pull_number: pullRequestNumber,
        },
      );
      const data = pull.data as {
        created_at?: string;
        updated_at?: string;
        merged_at?: string | null;
        closed_at?: string | null;
        head?: { repo?: { id?: number } | null };
      };
      branchDeleted =
        data.head?.repo === null ||
        (typeof data.head?.repo === "undefined");
      await this.upsertApiTimelineEvent(
        repositoryId,
        pullRequestNumber,
        "created",
        data.created_at,
        "api:pull",
        { source: "GET /repos/{owner}/{repo}/pulls/{pull_number}" },
      );
      if (data.merged_at) {
        await this.upsertApiTimelineEvent(
          repositoryId,
          pullRequestNumber,
          "merged",
          data.merged_at,
          "api:pull",
          { source: "GET /repos/{owner}/{repo}/pulls/{pull_number}" },
        );
      } else if (data.closed_at) {
        await this.upsertApiTimelineEvent(
          repositoryId,
          pullRequestNumber,
          "closed",
          data.closed_at,
          "api:pull",
          { source: "GET /repos/{owner}/{repo}/pulls/{pull_number}" },
        );
      }
      const reviews = await octokit.paginate(
        "GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews",
        {
          owner: repository.owner,
          repo: repository.name,
          pull_number: pullRequestNumber,
          per_page: 100,
        },
      ) as Array<{ submitted_at?: string; state?: string }>;
      for (const review of reviews) {
        if (!review.submitted_at) continue;
        const eventType =
          review.state?.toUpperCase() === "CHANGES_REQUESTED"
            ? "changes_requested"
            : review.state?.toUpperCase() === "APPROVED"
              ? "approved"
              : "first_review";
        await this.upsertApiTimelineEvent(
          repositoryId,
          pullRequestNumber,
          eventType,
          review.submitted_at,
          "api:reviews",
          { state: review.state ?? null, source: "GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews" },
        );
      }
    } catch (error) {
      // Live API fields unavailable. Stored webhook timeline remains usable.
    }

    const combined = await this.prisma.pullRequestLifecycleEvent.findMany({
      where: { repositoryId, pullRequestNumber },
      orderBy: { occurredAt: "asc" },
    });
    const eventTypes = new Set(combined.map((event) => event.eventType));
    const missing = [
      "created",
      "review_requested",
      "first_review",
      "changes_requested",
      "changes_submitted",
      "approved",
      "merged",
      "closed",
    ].filter((eventType) => !eventTypes.has(eventType));

    return {
      repositoryId,
      repositoryName: repository.fullName,
      pullRequestNumber,
      state: snapshot.state,
      branchDeleted,
      timeline: combined.map((event) => ({
        eventType: event.eventType,
        occurredAt: event.occurredAt.toISOString(),
        source: event.sourceDeliveryId.startsWith("api:")
          ? "GitHub API"
          : "GitHub webhook",
        available: true,
        metadata: event.metadata,
      })),
      unavailableLifecycleEvents: missing,
      incompleteHistory:
        missing.length > 0 ||
        !eventTypes.has("created"),
    };
  }

  async getIssueAging(context: Context, filters: BottleneckFilters) {
    const range = this.parseRange(filters.start, filters.end);
    const repositories = await this.findRepositories(context, filters.repositoryId);
    const issues = await this.prisma.gitHubIssueSnapshot.findMany({
      where: {
        repositoryId: { in: repositories.map((repository) => repository.id) },
        ...(filters.status && filters.status !== "all"
          ? { state: filters.status }
          : {}),
        githubUpdatedAt: { gte: range.start, lte: range.end },
      },
      include: { repository: true },
      orderBy: { githubUpdatedAt: "desc" },
    });
    return {
      start: range.start.toISOString(),
      end: range.end.toISOString(),
      issues: issues.map((issue) => ({
        repositoryId: issue.repositoryId,
        repositoryName: issue.repository.fullName,
        number: issue.number,
        title: issue.title,
        state: issue.state,
        ageElapsedHours: issue.state === "closed" && issue.closedAt
          ? this.hours(issue.githubCreatedAt, issue.closedAt)
          : this.hours(issue.githubCreatedAt, new Date()),
        ageWorkingHours: issue.state === "closed" && issue.closedAt
          ? this.workingHours(issue.githubCreatedAt, issue.closedAt)
          : this.workingHours(issue.githubCreatedAt, new Date()),
        lastActivityAt: issue.githubUpdatedAt.toISOString(),
        assigneeCount: issue.assigneeCount,
      })),
    };
  }

  async getHistory(context: Context, filters: BottleneckFilters) {
    const range = this.parseRange(filters.start, filters.end);
    const repositories = await this.findRepositories(context, filters.repositoryId);
    const findings = await this.prisma.developmentBottleneckFinding.findMany({
      where: {
        repositoryId: { in: repositories.map((repository) => repository.id) },
        detectedAt: { gte: range.start, lte: range.end },
        ...(filters.severity
          ? { severity: filters.severity.toUpperCase() }
          : {}),
        ...(filters.status === "active"
          ? { active: true }
          : filters.status === "resolved"
            ? { active: false }
            : {}),
      },
      include: { repository: true },
      orderBy: { detectedAt: "desc" },
    });
    const grouped = new Map<string, number>();
    for (const finding of findings) {
      const day = finding.detectedAt.toISOString().slice(0, 10);
      grouped.set(day, (grouped.get(day) ?? 0) + 1);
    }
    return {
      start: range.start.toISOString(),
      end: range.end.toISOString(),
      trend: [...grouped.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([date, count]) => ({ date, count })),
      findings: findings.map((finding) => ({
        id: finding.id,
        findingType: finding.findingType,
        severity: finding.severity,
        repositoryId: finding.repositoryId,
        repositoryName: finding.repository.fullName,
        referenceType: finding.referenceType,
        referenceNumber: finding.referenceNumber,
        evidence: finding.evidence,
        detectedAt: finding.detectedAt.toISOString(),
        resolvedAt: finding.resolvedAt?.toISOString() ?? null,
        active: finding.active,
        suggestedAction: finding.suggestedAction,
      })),
    };
  }

  private async calculate(context: Context, filters: BottleneckFilters) {
    const range = this.parseRange(filters.start, filters.end);
    const repositories = await this.findRepositories(context, filters.repositoryId);
    const pullRequests: PullRequestInput[] = [];
    const issues: IssueInput[] = [];

    for (const repository of repositories) {
      const [prSnapshots, issueSnapshots] = await Promise.all([
        this.prisma.gitHubPullRequestSnapshot.findMany({
          where: {
            repositoryId: repository.id,
            githubUpdatedAt: { gte: range.start, lte: range.end },
          },
          orderBy: { number: "asc" },
        }),
        this.prisma.gitHubIssueSnapshot.findMany({
          where: {
            repositoryId: repository.id,
            githubUpdatedAt: { gte: range.start, lte: range.end },
          },
          orderBy: { number: "asc" },
        }),
      ]);

      for (const pr of prSnapshots) {
        const timelineRows = await this.prisma.pullRequestLifecycleEvent.findMany({
          where: { repositoryId: repository.id, pullRequestNumber: pr.number },
          orderBy: { occurredAt: "asc" },
        });
        const timeline = timelineRows.map((event) => ({
          eventType: event.eventType as LifecycleEvent["eventType"],
          occurredAt: event.occurredAt,
          sourceDeliveryId: event.sourceDeliveryId,
        }));
        const eventTypes = new Set(timeline.map((event) => event.eventType));
        pullRequests.push({
          repositoryId: repository.id,
          repositoryName: repository.fullName,
          number: pr.number,
          title: pr.title,
          state: pr.state === "open" ? "open" : "closed",
          createdAt: pr.githubCreatedAt,
          updatedAt: pr.githubUpdatedAt,
          mergedAt: pr.mergedAt,
          closedAt: pr.closedAt,
          branchDeleted: timelineRows.some(
            (event) => {
              const metadata = event.metadata as { branchDeleted?: unknown };
              return metadata.branchDeleted === true;
            },
          ),
          timeline,
          historyComplete: eventTypes.has("created") &&
            (pr.state === "open" || eventTypes.has("merged") || eventTypes.has("closed")),
        });
      }

      for (const issue of issueSnapshots) {
        const timelineRows = await this.prisma.issueLifecycleEvent.findMany({
          where: { repositoryId: repository.id, issueNumber: issue.number },
          orderBy: { occurredAt: "asc" },
        });
        const eventTypes = new Set(timelineRows.map((event) => event.eventType));
        issues.push({
          repositoryId: repository.id,
          repositoryName: repository.fullName,
          number: issue.number,
          title: issue.title,
          state: issue.state === "open" ? "open" : "closed",
          createdAt: issue.githubCreatedAt,
          updatedAt: issue.githubUpdatedAt,
          closedAt: issue.closedAt,
          timeline: timelineRows.map((event) => ({
            eventType: event.eventType as LifecycleEvent["eventType"],
            occurredAt: event.occurredAt,
            sourceDeliveryId: event.sourceDeliveryId,
          })),
          historyComplete: eventTypes.has("issue_created") &&
            (issue.state === "open" || eventTypes.has("issue_closed")),
        });
      }
    }

    const result = this.engine.calculate({
      calculatedAt: new Date(),
      pullRequests,
      issues,
    });
    await this.syncFindings(repositories, result.findings);
    return { repositories, result };
  }

  private async syncFindings(
    repositories: Array<{ id: string }>,
    findings: BottleneckFindingInput[],
  ) {
    const now = new Date();
    const activeKeys = new Set<string>();
    for (const finding of findings) {
      const reference = finding.referenceNumber ?? "repository";
      const findingKey =
        `${finding.repositoryId}:${finding.findingType}:${finding.referenceType}:${reference}`;
      activeKeys.add(findingKey);
      await this.prisma.developmentBottleneckFinding.upsert({
        where: { findingKey },
        create: {
          repositoryId: finding.repositoryId === "unknown"
            ? repositories[0]?.id
            : finding.repositoryId,
          findingType: finding.findingType,
          severity: finding.severity,
          referenceType: finding.referenceType,
          referenceNumber: finding.referenceNumber,
          findingKey,
          evidence: finding.evidence as Prisma.JsonObject,
          detectedAt: now,
          active: true,
          suggestedAction: finding.suggestedAction,
        },
        update: {
          severity: finding.severity,
          evidence: finding.evidence as Prisma.JsonObject,
          active: true,
          resolvedAt: null,
          suggestedAction: finding.suggestedAction,
        },
      });
    }

    const repositoryIds = repositories.map((repository) => repository.id);
    if (repositoryIds.length === 0) return;
    const existing = await this.prisma.developmentBottleneckFinding.findMany({
      where: { repositoryId: { in: repositoryIds }, active: true },
    });
    for (const finding of existing) {
      if (!activeKeys.has(finding.findingKey)) {
        await this.prisma.developmentBottleneckFinding.update({
          where: { id: finding.id },
          data: { active: false, resolvedAt: now },
        });
      }
    }
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
        installation: { select: { installationId: true } },
      },
    });
    if (!repository) throw new NotFoundException("Connected repository was not found");
    return repository;
  }

  private async findRepositories(context: Context, repositoryId?: string) {
    return this.prisma.connectedRepository.findMany({
      where: {
        disconnectedAt: null,
        ...(repositoryId ? { id: repositoryId } : {}),
        installation: {
          organizationId: context.organizationId,
          status: "ACTIVE",
        },
      },
      orderBy: { fullName: "asc" },
    });
  }

  private filterFindings(
    findings: BottleneckFindingInput[],
    repositories: Array<{ id: string }>,
    filters: BottleneckFilters,
  ) {
    return findings.filter((finding) => {
      if (filters.repositoryId &&
          finding.repositoryId !== "unknown" &&
          finding.repositoryId !== filters.repositoryId) return false;
      if (filters.severity &&
          finding.severity !== filters.severity.toUpperCase()) return false;
      return true;
    });
  }

  private withDetectedTimestamp(
    finding: BottleneckFindingInput,
    calculatedAt: string,
  ) {
    return {
      findingType: finding.findingType,
      severity: finding.severity,
      repositoryId: finding.repositoryId,
      repositoryReference: finding.repositoryName,
      referenceType: finding.referenceType,
      referenceNumber: finding.referenceNumber,
      evidence: finding.evidence,
      detectedAt: calculatedAt,
      active: true,
      suggestedAction: finding.suggestedAction,
    };
  }

  private parseRange(startValue?: string, endValue?: string) {
    const endDate = endValue ? this.parseDate(endValue) : new Date();
    const startDate = startValue
      ? this.parseDate(startValue)
      : new Date(endDate.getTime() - 30 * 86_400_000);
    if (startDate > endDate) throw new BadRequestException("Start date must be before end date");
    if (endDate.getTime() - startDate.getTime() > 366 * 86_400_000) {
      throw new BadRequestException("Date range cannot exceed 366 days");
    }
    return { start: startDate, end: endDate };
  }

  private parseDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException("Dates must use YYYY-MM-DD format");
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      throw new BadRequestException("Invalid date");
    }
    return date;
  }

  private async upsertApiTimelineEvent(
    repositoryId: string,
    pullRequestNumber: number,
    eventType: string,
    occurredAt: string | undefined,
    sourceDeliveryId: string,
    metadata: Record<string, unknown>,
  ) {
    if (!occurredAt) return;
    const date = new Date(occurredAt);
    if (Number.isNaN(date.getTime())) return;
    const eventKey =
      `${repositoryId}:pr:${pullRequestNumber}:${eventType}:${date.toISOString()}:${sourceDeliveryId}`;
    await this.prisma.pullRequestLifecycleEvent.upsert({
      where: { eventKey },
      create: {
        repositoryId,
        pullRequestNumber,
        eventType,
        occurredAt: date,
        sourceDeliveryId,
        eventKey,
        metadata: metadata as Prisma.JsonObject,
        historyComplete: true,
      },
      update: { metadata: metadata as Prisma.JsonObject, historyComplete: true },
    });
  }

  private hours(start: Date, end: Date) {
    return Math.max(0, Math.round(((end.getTime() - start.getTime()) / 3_600_000) * 10) / 10);
  }

  private workingHours(start: Date, end: Date) {
    let hours = 0;
    const cursor = new Date(start);
    while (cursor < end) {
      const weekday = cursor.getUTCDay();
      const hour = cursor.getUTCHours();
      if (weekday >= 1 && weekday <= 5 && hour >= 9 && hour < 17) hours++;
      cursor.setUTCHours(cursor.getUTCHours() + 1);
    }
    return hours;
  }
}
