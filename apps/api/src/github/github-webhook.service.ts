import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import { createHmac, timingSafeEqual } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { GitHubConfigService } from "./github-config.service";
import { Prisma } from "@prisma/client";

type QueuePayload = {
  action?: unknown;
  installation?: { id?: unknown; account?: { id?: unknown; login?: unknown; type?: unknown } };
  repository?: Record<string, unknown>;
  repositories_added?: Array<Record<string, unknown>>;
  repositories_removed?: Array<Record<string, unknown>>;
  ref?: unknown;
  before?: unknown;
  after?: unknown;
  head_commit?: Record<string, unknown> | null;
  commits?: unknown[];
  issue?: Record<string, unknown>;
  pull_request?: Record<string, unknown>;
  release?: Record<string, unknown>;
  pull_request_review?: Record<string, unknown>;
  review?: Record<string, unknown>;
  requested_reviewer?: Record<string, unknown>;
};

@Injectable()
export class GitHubWebhookService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GitHubWebhookService.name);
  private workerTimer: NodeJS.Timeout | undefined;
  private processing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: GitHubConfigService,
  ) {}

  onModuleInit() {
    this.workerTimer = setInterval(() => {
      void this.runDueJobs();
    }, 15_000);
    void this.runDueJobs();
  }

  onModuleDestroy() {
    if (this.workerTimer) clearInterval(this.workerTimer);
  }

  async enqueue(
    rawBody: Buffer,
    signature: string | undefined,
    deliveryId: string | undefined,
    eventType: string | undefined,
    payload: unknown,
  ) {
    this.verifySignature(rawBody, signature);
    if (!deliveryId || !/^[A-Za-z0-9-]{8,128}$/.test(deliveryId)) {
      throw new BadRequestException("Valid GitHub delivery ID is required");
    }
    if (!eventType || !/^[a-z_]+$/.test(eventType)) {
      throw new BadRequestException("Valid GitHub event type is required");
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new BadRequestException("Webhook payload must be a JSON object");
    }

    const supported = new Set([
      "installation",
      "installation_repositories",
      "push",
      "issues",
      "pull_request",
      "pull_request_review",
      "release",
    ]);
    if (!supported.has(eventType)) {
      return { accepted: true, duplicate: false, queued: false };
    }

    const body = payload as QueuePayload;
    const installationId = this.optionalPositiveBigInt(body.installation?.id);
    const repositoryId = this.optionalPositiveBigInt(
      (body.repository as Record<string, unknown> | undefined)?.id,
    );
    const action = typeof body.action === "string" ? body.action.slice(0, 80) : null;

    const existing = await this.prisma.gitHubWebhookEvent.findUnique({
      where: { deliveryId },
    });
    if (existing) {
      return { accepted: true, duplicate: true, queued: false };
    }

    const metadata = this.buildMetadata(eventType, body);
    await this.prisma.gitHubWebhookEvent.create({
      data: {
        deliveryId,
        eventType,
        action,
        installationId,
        repositoryId,
        metadata: JSON.parse(JSON.stringify(metadata)) as Prisma.JsonObject,
        status: "PENDING",
        nextAttemptAt: new Date(),
      },
    });

    setImmediate(() => void this.processJob(deliveryId));
    return { accepted: true, duplicate: false, queued: true };
  }

  async getRepositoryIntelligence(context: { organizationId: string }) {
    const repositories = await this.prisma.connectedRepository.findMany({
      where: {
        disconnectedAt: null,
        installation: {
          organizationId: context.organizationId,
          status: "ACTIVE",
        },
      },
      include: {
        health: true,
        recentEvents: {
          orderBy: { occurredAt: "desc" },
          take: 12,
        },
      },
      orderBy: { fullName: "asc" },
    });

    return {
      repositories: repositories.map((repository) => ({
        id: repository.id,
        name: repository.fullName,
        health: repository.health
          ? {
              status: repository.health.status,
              score: repository.health.score,
              unresolvedIssues: repository.health.unresolvedIssues,
              stalePullRequests: repository.health.stalePullRequests,
              inactiveIssues: repository.health.inactiveIssues,
              pushes30d: repository.health.pushes30d,
              activityTrend: repository.health.activityTrend,
              explanations: repository.health.explanations,
              computedAt: repository.health.computedAt,
            }
          : null,
      })),
      recentEvents: repositories
        .flatMap((repository) =>
          repository.recentEvents.map((event) => ({
            id: event.id,
            repository: repository.fullName,
            eventType: event.eventType,
            action: event.action,
            title: event.title,
            description: event.description,
            githubId: event.githubId,
            occurredAt: event.occurredAt,
          })),
        )
        .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())
        .slice(0, 30),
    };
  }

  private verifySignature(rawBody: Buffer, signature: string | undefined) {
    if (!signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) {
      throw new UnauthorizedException("Invalid GitHub webhook signature");
    }
    const expected = `sha256=${createHmac("sha256", this.config.webhookSecret)
      .update(rawBody)
      .digest("hex")}`;
    const actualBuffer = Buffer.from(signature.toLowerCase());
    const expectedBuffer = Buffer.from(expected);
    if (
      actualBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(actualBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException("Invalid GitHub webhook signature");
    }
  }

  private async runDueJobs() {
    if (this.processing) return;
    this.processing = true;
    try {
      const jobs = await this.prisma.gitHubWebhookEvent.findMany({
        where: {
          status: { in: ["PENDING", "FAILED"] },
          nextAttemptAt: { lte: new Date() },
          attempts: { lt: 5 },
        },
        orderBy: { receivedAt: "asc" },
        take: 20,
      });
      await Promise.all(jobs.map((job) => this.processJob(job.deliveryId)));
    } finally {
      this.processing = false;
    }
  }

  private async processJob(deliveryId: string) {
    const claimed = await this.prisma.gitHubWebhookEvent.updateMany({
      where: {
        deliveryId,
        status: { in: ["PENDING", "FAILED"] },
        attempts: { lt: 5 },
      },
      data: {
        status: "PROCESSING",
        attempts: { increment: 1 },
      },
    });
    if (claimed.count !== 1) return;

    const job = await this.prisma.gitHubWebhookEvent.findUnique({
      where: { deliveryId },
    });
    if (!job) return;

    try {
      await this.processEvent(job);
      await this.prisma.gitHubWebhookEvent.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          processedAt: new Date(),
          error: null,
        },
      });
    } catch (error) {
      const attempts = job.attempts + 1;
      const retryable = this.isRetryableError(error);
      const message = this.safeErrorMessage(error);
      if (retryable && attempts < 5) {
        const delay = 30_000 * Math.pow(2, attempts - 1);
        await this.prisma.gitHubWebhookEvent.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            error: message,
            nextAttemptAt: new Date(Date.now() + delay),
          },
        });
        this.logger.warn(`Webhook ${deliveryId} scheduled for retry ${attempts}`);
      } else {
        await this.prisma.gitHubWebhookEvent.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            error: message,
            nextAttemptAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });
        this.logger.error(`Webhook ${deliveryId} failed permanently: ${message}`);
      }
    }
  }

  private async processEvent(job: {
    id: string;
    deliveryId: string;
    eventType: string;
    action: string | null;
    installationId: bigint | null;
    repositoryId: bigint | null;
    metadata: unknown;
  }) {
    const metadata = job.metadata as QueuePayload;

    if (job.eventType === "installation") {
      await this.processInstallation(job.installationId, job.action, metadata);
      return;
    }

    if (job.eventType === "installation_repositories") {
      await this.processInstallationRepositories(job.installationId, metadata);
      return;
    }

    if (!job.repositoryId) return;
    const repository = await this.prisma.connectedRepository.findFirst({
      where: {
        githubRepoId: job.repositoryId,
        disconnectedAt: null,
        installation: { status: "ACTIVE" },
      },
    });
    if (!repository) return;

    if (job.eventType === "push") {
      await this.processPush(repository.id, job.deliveryId, job.action, metadata);
    } else if (job.eventType === "issues") {
      await this.processIssue(repository.id, job.deliveryId, job.action, metadata);
    } else if (job.eventType === "pull_request") {
      await this.processPullRequest(repository.id, job.deliveryId, job.action, metadata);
    } else if (job.eventType === "pull_request_review") {
      await this.processPullRequestReview(repository.id, job.deliveryId, job.action, metadata);
    } else if (job.eventType === "release") {
      await this.processRelease(repository.id, job.deliveryId, job.action, metadata);
    }

    await this.recomputeHealth(repository.id);
  }

  private async processInstallation(
    installationId: bigint | null,
    action: string | null,
    metadata: QueuePayload,
  ) {
    if (!installationId) return;
    if (action === "deleted") {
      await this.prisma.gitHubInstallation.updateMany({
        where: { installationId },
        data: { status: "UNINSTALLED", uninstalledAt: new Date() },
      });
      await this.prisma.connectedRepository.updateMany({
        where: { installation: { installationId } },
        data: { disconnectedAt: new Date() },
      });
    } else if (action === "suspend") {
      await this.prisma.gitHubInstallation.updateMany({
        where: { installationId },
        data: { status: "SUSPENDED", suspendedAt: new Date() },
      });
    } else if (action === "unsuspend") {
      await this.prisma.gitHubInstallation.updateMany({
        where: { installationId },
        data: { status: "ACTIVE", suspendedAt: null },
      });
    }
  }

  private async processInstallationRepositories(
    installationId: bigint | null,
    metadata: QueuePayload,
  ) {
    if (!installationId) return;
    const installation = await this.prisma.gitHubInstallation.findUnique({
      where: { installationId },
    });
    if (!installation) return;

    for (const removed of metadata.repositories_removed ?? []) {
      const githubRepoId = this.optionalPositiveBigInt(removed.id);
      if (githubRepoId) {
        await this.prisma.connectedRepository.updateMany({
          where: { installationId: installation.id, githubRepoId },
          data: { disconnectedAt: new Date() },
        });
      }
    }

    for (const added of metadata.repositories_added ?? []) {
      await this.upsertRepository(installation.id, added);
    }
  }

  private async processPush(
    repositoryId: string,
    deliveryId: string,
    action: string | null,
    metadata: QueuePayload,
  ) {
    const repository = await this.prisma.connectedRepository.findUnique({
      where: { id: repositoryId },
    });
    if (!repository) return;
    const commitCount = Array.isArray(metadata.commits) ? metadata.commits.length : 0;
    const headCommit = metadata.head_commit;
    const occurredAt = this.dateValue(headCommit?.timestamp) ?? new Date();
    await this.prisma.gitHubRecentEvent.upsert({
      where: { deliveryId_eventType: { deliveryId, eventType: "push" } },
      create: {
        repositoryId,
        eventType: "push",
        action,
        deliveryId,
        title: typeof headCommit?.message === "string"
          ? headCommit.message.slice(0, 200)
          : `${commitCount} commit${commitCount === 1 ? "" : "s"} pushed`,
        description: typeof metadata.ref === "string" ? metadata.ref : null,
        githubId: typeof metadata.after === "string" ? metadata.after : null,
        occurredAt,
      },
      update: {
        title: typeof headCommit?.message === "string"
          ? headCommit.message.slice(0, 200)
          : `${commitCount} commit${commitCount === 1 ? "" : "s"} pushed`,
        description: typeof metadata.ref === "string" ? metadata.ref : null,
        githubId: typeof metadata.after === "string" ? metadata.after : null,
        occurredAt,
        action,
      },
    });
    await this.prisma.connectedRepository.update({
      where: { id: repositoryId },
      data: { updatedAt: occurredAt },
    });
  }

  private async processIssue(
    repositoryId: string,
    deliveryId: string,
    action: string | null,
    metadata: QueuePayload,
  ) {
    const issue = metadata.issue;
    if (!issue) return;
    const githubIssueId = this.optionalPositiveBigInt(issue.id);
    const number = this.optionalPositiveInt(issue.number);
    if (!githubIssueId || !number) return;
    const updatedAt = this.dateValue(issue.updated_at) ?? new Date();
    await this.prisma.gitHubIssueSnapshot.upsert({
      where: {
        repositoryId_githubIssueId: { repositoryId, githubIssueId },
      },
      create: {
        repositoryId,
        githubIssueId,
        number,
        title: typeof issue.title === "string" ? issue.title.slice(0, 500) : "Untitled issue",
        state: issue.state === "closed" ? "closed" : "open",
        authorLogin: typeof (issue.user as Record<string, unknown> | undefined)?.login === "string"
          ? ((issue.user as Record<string, unknown>).login as string)
          : null,
        assigneeCount: Array.isArray(issue.assignees) ? issue.assignees.length : 0,
        labels: Array.isArray(issue.labels) ? issue.labels : [],
        githubCreatedAt: this.dateValue(issue.created_at) ?? updatedAt,
        githubUpdatedAt: updatedAt,
        closedAt: this.dateValue(issue.closed_at),
      },
      update: {
        number,
        title: typeof issue.title === "string" ? issue.title.slice(0, 500) : "Untitled issue",
        state: issue.state === "closed" ? "closed" : "open",
        assigneeCount: Array.isArray(issue.assignees) ? issue.assignees.length : 0,
        labels: Array.isArray(issue.labels) ? issue.labels : [],
        githubUpdatedAt: updatedAt,
        closedAt: this.dateValue(issue.closed_at),
      },
    });
    const issueEventType =
      action === "opened" ? "issue_created" :
      action === "closed" ? "issue_closed" :
      action === "reopened" ? "issue_reopened" :
      "issue_updated";
    await this.upsertIssueTimeline(
      repositoryId,
      number,
      issueEventType,
      updatedAt,
      deliveryId,
      { action: action ?? null },
    );
    await this.prisma.gitHubRecentEvent.upsert({
      where: { deliveryId_eventType: { deliveryId, eventType: "issue" } },
      create: {
        repositoryId,
        eventType: "issue",
        action,
        deliveryId,
        title: typeof issue.title === "string" ? issue.title.slice(0, 200) : `Issue #${number}`,
        description: action ? `Issue ${action}` : "Issue updated",
        githubId: String(number),
        occurredAt: updatedAt,
      },
      update: {
        title: typeof issue.title === "string" ? issue.title.slice(0, 200) : `Issue #${number}`,
        description: action ? `Issue ${action}` : "Issue updated",
        githubId: String(number),
        occurredAt: updatedAt,
        action,
      },
    });
  }

  private async processPullRequestReview(
    repositoryId: string,
    deliveryId: string,
    action: string | null,
    metadata: QueuePayload,
  ) {
    const pullRequest = metadata.pull_request;
    const review = metadata.review;
    if (!pullRequest || !review) return;
    const number = this.optionalPositiveInt(pullRequest.number);
    if (!number) return;
    const submittedAt =
      this.dateValue(review.submitted_at) ??
      this.dateValue(review.updated_at) ??
      new Date();
    const state = typeof review.state === "string" ? review.state.toUpperCase() : "";
    const eventType =
      state === "CHANGES_REQUESTED" ? "changes_requested" :
      state === "APPROVED" ? "approved" :
      "first_review";
    await this.upsertPullRequestTimeline(
      repositoryId,
      number,
      eventType,
      submittedAt,
      deliveryId,
      {
        action,
        reviewState: state || null,
      },
    );
  }

  private async processPullRequest(
    repositoryId: string,
    deliveryId: string,
    action: string | null,
    metadata: QueuePayload,
  ) {
    const pullRequest = metadata.pull_request;
    if (!pullRequest) return;
    const githubPullId = this.optionalPositiveBigInt(pullRequest.id);
    const number = this.optionalPositiveInt(pullRequest.number);
    if (!githubPullId || !number) return;
    const updatedAt = this.dateValue(pullRequest.updated_at) ?? new Date();
    await this.prisma.gitHubPullRequestSnapshot.upsert({
      where: {
        repositoryId_githubPullId: { repositoryId, githubPullId },
      },
      create: {
        repositoryId,
        githubPullId,
        number,
        title: typeof pullRequest.title === "string" ? pullRequest.title.slice(0, 500) : "Untitled pull request",
        state: pullRequest.state === "closed" ? "closed" : "open",
        draft: pullRequest.draft === true,
        authorLogin: typeof (pullRequest.user as Record<string, unknown> | undefined)?.login === "string"
          ? ((pullRequest.user as Record<string, unknown>).login as string)
          : null,
        mergedAt: this.dateValue(pullRequest.merged_at),
        closedAt: this.dateValue(pullRequest.closed_at),
        githubCreatedAt: this.dateValue(pullRequest.created_at) ?? updatedAt,
        githubUpdatedAt: updatedAt,
      },
      update: {
        number,
        title: typeof pullRequest.title === "string" ? pullRequest.title.slice(0, 500) : "Untitled pull request",
        state: pullRequest.state === "closed" ? "closed" : "open",
        draft: pullRequest.draft === true,
        mergedAt: this.dateValue(pullRequest.merged_at),
        closedAt: this.dateValue(pullRequest.closed_at),
        githubUpdatedAt: updatedAt,
      },
    });
    const pullEventType =
      action === "opened" ? "created" :
      action === "review_requested" ? "review_requested" :
      action === "closed" && pullRequest.merged_at ? "merged" :
      action === "closed" ? "closed" :
      action === "reopened" ? "reopened" :
      action === "ready_for_review" ? "ready_for_review" :
      action === "synchronize" ? "submitted" :
      "submitted";
    await this.upsertPullRequestTimeline(
      repositoryId,
      number,
      pullEventType,
      this.dateValue(pullRequest.updated_at) ?? updatedAt,
      deliveryId,
      {
        action: action ?? null,
        merged: pullRequest.merged_at ? true : false,
        branchDeleted: typeof pullRequest.head === "object" &&
          pullRequest.head !== null &&
          (pullRequest.head as Record<string, unknown>).repo === null,
      },
    );
    await this.prisma.gitHubRecentEvent.upsert({
      where: { deliveryId_eventType: { deliveryId, eventType: "pull_request" } },
      create: {
        repositoryId,
        eventType: "pull_request",
        action,
        deliveryId,
        title: typeof pullRequest.title === "string" ? pullRequest.title.slice(0, 200) : `Pull request #${number}`,
        description: action ? `Pull request ${action}` : "Pull request updated",
        githubId: String(number),
        occurredAt: updatedAt,
      },
      update: {
        title: typeof pullRequest.title === "string" ? pullRequest.title.slice(0, 200) : `Pull request #${number}`,
        description: action ? `Pull request ${action}` : "Pull request updated",
        githubId: String(number),
        occurredAt: updatedAt,
        action,
      },
    });
  }

  private async processRelease(
    repositoryId: string,
    deliveryId: string,
    action: string | null,
    metadata: QueuePayload,
  ) {
    const release = metadata.release;
    if (!release) return;
    const githubReleaseId = this.optionalPositiveBigInt(release.id);
    if (!githubReleaseId) return;
    const createdAt = this.dateValue(release.created_at) ?? new Date();
    await this.prisma.gitHubReleaseSnapshot.upsert({
      where: {
        repositoryId_githubReleaseId: { repositoryId, githubReleaseId },
      },
      create: {
        repositoryId,
        githubReleaseId,
        tagName: typeof release.tag_name === "string" ? release.tag_name.slice(0, 200) : "unknown",
        name: typeof release.name === "string" ? release.name.slice(0, 200) : null,
        draft: release.draft === true,
        prerelease: release.prerelease === true,
        publishedAt: this.dateValue(release.published_at),
        githubCreatedAt: createdAt,
      },
      update: {
        tagName: typeof release.tag_name === "string" ? release.tag_name.slice(0, 200) : "unknown",
        name: typeof release.name === "string" ? release.name.slice(0, 200) : null,
        draft: release.draft === true,
        prerelease: release.prerelease === true,
        publishedAt: this.dateValue(release.published_at),
      },
    });
    await this.prisma.gitHubRecentEvent.upsert({
      where: { deliveryId_eventType: { deliveryId, eventType: "release" } },
      create: {
        repositoryId,
        eventType: "release",
        action,
        deliveryId,
        title: typeof release.name === "string" && release.name
          ? release.name.slice(0, 200)
          : typeof release.tag_name === "string"
            ? release.tag_name.slice(0, 200)
            : "Release",
        description: action ? `Release ${action}` : "Release updated",
        githubId: String(githubReleaseId),
        occurredAt: this.dateValue(release.published_at) ?? createdAt,
      },
      update: {
        title: typeof release.name === "string" && release.name
          ? release.name.slice(0, 200)
          : typeof release.tag_name === "string"
            ? release.tag_name.slice(0, 200)
            : "Release",
        description: action ? `Release ${action}` : "Release updated",
        githubId: String(githubReleaseId),
        occurredAt: this.dateValue(release.published_at) ?? createdAt,
        action,
      },
    });
  }

  private async recomputeHealth(repositoryId: string) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 86_400_000);
    const stalePullDate = new Date(now.getTime() - 30 * 86_400_000);
    const inactiveIssueDate = new Date(now.getTime() - 14 * 86_400_000);

    const [openIssues, stalePullRequests, inactiveIssues, pushes30d, pushesPrevious30d] =
      await Promise.all([
        this.prisma.gitHubIssueSnapshot.count({
          where: { repositoryId, state: "open" },
        }),
        this.prisma.gitHubPullRequestSnapshot.count({
          where: {
            repositoryId,
            state: "open",
            githubUpdatedAt: { lt: stalePullDate },
          },
        }),
        this.prisma.gitHubIssueSnapshot.count({
          where: {
            repositoryId,
            state: "open",
            githubUpdatedAt: { lt: inactiveIssueDate },
          },
        }),
        this.prisma.gitHubRecentEvent.count({
          where: {
            repositoryId,
            eventType: "push",
            occurredAt: { gte: thirtyDaysAgo },
          },
        }),
        this.prisma.gitHubRecentEvent.count({
          where: {
            repositoryId,
            eventType: "push",
            occurredAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
          },
        }),
      ]);

    let activityTrend = "unknown";
    if (pushes30d === 0 && pushesPrevious30d === 0) activityTrend = "unchanged";
    else if (pushes30d < pushesPrevious30d) activityTrend = "declining";
    else if (pushes30d > pushesPrevious30d) activityTrend = "improving";
    else activityTrend = "steady";

    const penalties =
      Math.min(stalePullRequests * 8, 40) +
      Math.min(inactiveIssues * 5, 30) +
      (activityTrend === "declining" ? 15 : 0) +
      (pushes30d === 0 && pushesPrevious30d > 0 ? 10 : 0);
    const score = Math.max(0, 100 - penalties);
    const status =
      score >= 75 ? "HEALTHY" : score >= 50 ? "WATCH" : "AT_RISK";
    const indicators: string[] = [];
    const explanations: string[] = [];
    if (stalePullRequests > 0) {
      indicators.push("stale_pull_requests");
      explanations.push(`${stalePullRequests} open pull request${stalePullRequests === 1 ? " is" : "s are"} stale: no update in over 30 days.`);
    }
    if (inactiveIssues > 0) {
      indicators.push("inactive_issues");
      explanations.push(`${inactiveIssues} open issue${inactiveIssues === 1 ? " has" : "s have"} had no update in over 14 days.`);
    }
    if (activityTrend === "declining") {
      indicators.push("declining_push_activity");
      explanations.push("Push activity is lower in the latest 30-day period than the previous 30-day period.");
    }
    if (explanations.length === 0) {
      explanations.push(openIssues === 0
        ? "No open issues are recorded and no current alert thresholds are exceeded."
        : "No stale pull requests or inactive issue thresholds are currently exceeded.");
    }

    await this.prisma.repositoryHealth.upsert({
      where: { repositoryId },
      create: {
        repositoryId,
        status,
        score,
        unresolvedIssues: openIssues,
        stalePullRequests,
        inactiveIssues,
        pushes30d,
        activityTrend,
        indicators,
        explanations,
        computedAt: now,
      },
      update: {
        status,
        score,
        unresolvedIssues: openIssues,
        stalePullRequests,
        inactiveIssues,
        pushes30d,
        activityTrend,
        indicators,
        explanations,
        computedAt: now,
      },
    });
  }

  private async upsertRepository(
    installationRecordId: string,
    repository: Record<string, unknown>,
  ) {
    const githubRepoId = this.optionalPositiveBigInt(repository.id);
    if (!githubRepoId) return;
    const owner = (repository.owner as Record<string, unknown> | undefined)?.login;
    const name = repository.name;
    if (typeof owner !== "string" || typeof name !== "string") return;
    await this.prisma.connectedRepository.upsert({
      where: { githubRepoId },
      create: {
        installationId: installationRecordId,
        githubRepoId,
        owner,
        name,
        fullName: typeof repository.full_name === "string" ? repository.full_name : `${owner}/${name}`,
        description: typeof repository.description === "string" ? repository.description : null,
        visibility: repository.private === true ? "private" : "public",
        defaultBranch: typeof repository.default_branch === "string" ? repository.default_branch : null,
        primaryLanguage: typeof repository.language === "string" ? repository.language : null,
        isArchived: repository.archived === true,
        disconnectedAt: null,
      },
      update: {
        owner,
        name,
        fullName: typeof repository.full_name === "string" ? repository.full_name : `${owner}/${name}`,
        description: typeof repository.description === "string" ? repository.description : null,
        visibility: repository.private === true ? "private" : "public",
        defaultBranch: typeof repository.default_branch === "string" ? repository.default_branch : null,
        primaryLanguage: typeof repository.language === "string" ? repository.language : null,
        isArchived: repository.archived === true,
        disconnectedAt: null,
      },
    });
  }

  private async upsertPullRequestTimeline(
    repositoryId: string,
    pullRequestNumber: number,
    eventType: string,
    occurredAt: Date,
    deliveryId: string,
    metadata: Record<string, unknown>,
  ) {
    const eventKey =
      `${repositoryId}:pr:${pullRequestNumber}:${eventType}:${occurredAt.toISOString()}:${deliveryId}`;
    await this.prisma.pullRequestLifecycleEvent.upsert({
      where: { eventKey },
      create: {
        repositoryId,
        pullRequestNumber,
        eventType,
        occurredAt,
        sourceDeliveryId: deliveryId,
        eventKey,
        metadata: JSON.parse(JSON.stringify(metadata)) as Prisma.JsonObject,
        historyComplete: false,
      },
      update: {
        metadata: JSON.parse(JSON.stringify(metadata)) as Prisma.JsonObject,
      },
    });
  }

  private async upsertIssueTimeline(
    repositoryId: string,
    issueNumber: number,
    eventType: string,
    occurredAt: Date,
    deliveryId: string,
    metadata: Record<string, unknown>,
  ) {
    const eventKey =
      `${repositoryId}:issue:${issueNumber}:${eventType}:${occurredAt.toISOString()}:${deliveryId}`;
    await this.prisma.issueLifecycleEvent.upsert({
      where: { eventKey },
      create: {
        repositoryId,
        issueNumber,
        eventType,
        occurredAt,
        sourceDeliveryId: deliveryId,
        eventKey,
        metadata: JSON.parse(JSON.stringify(metadata)) as Prisma.JsonObject,
        historyComplete: false,
      },
      update: {
        metadata: JSON.parse(JSON.stringify(metadata)) as Prisma.JsonObject,
      },
    });
  }

  private buildMetadata(eventType: string, body: QueuePayload) {
    if (eventType === "push") {
      return {
        ref: body.ref,
        before: body.before,
        after: body.after,
        commits: Array.isArray(body.commits)
          ? body.commits.slice(0, 100).map((commit) =>
              typeof commit === "object" && commit
                ? {
                    id: (commit as Record<string, unknown>).id,
                    timestamp: (commit as Record<string, unknown>).timestamp,
                  }
                : {},
            )
          : [],
        head_commit: body.head_commit
          ? {
              message: body.head_commit.message,
              timestamp: body.head_commit.timestamp,
            }
          : null,
      };
    }
    if (eventType === "issues") return { action: body.action, issue: body.issue };
    if (eventType === "pull_request") return { action: body.action, pull_request: body.pull_request };
    if (eventType === "release") return { action: body.action, release: body.release };
    if (eventType === "pull_request_review") {
      return {
        action: body.action,
        pull_request: body.pull_request,
        review: body.review,
      };
    }
    if (eventType === "installation") return { action: body.action };
    if (eventType === "installation_repositories") {
      return {
        action: body.action,
        repositories_added: body.repositories_added?.slice(0, 100),
        repositories_removed: body.repositories_removed?.slice(0, 100),
      };
    }
    return {};
  }

  private optionalPositiveBigInt(value: unknown): bigint | null {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) return null;
    return BigInt(value);
  }

  private optionalPositiveInt(value: unknown): number | null {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) return null;
    return value;
  }

  private dateValue(value: unknown): Date | null {
    if (typeof value !== "string" || !value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private isRetryableError(error: unknown): boolean {
    if (typeof error !== "object" || !error) return true;
    const status = Number((error as { status?: number }).status);
    return status === 429 || status >= 500;
  }

  private safeErrorMessage(error: unknown): string {
    if (typeof error === "object" && error) {
      const status = Number((error as { status?: number }).status);
      if (status === 401) return "GitHub authorization failed";
      if (status === 403) return "GitHub access or rate limit restriction";
      if (status === 404) return "GitHub resource was not found";
      if (status >= 500) return "GitHub API temporary failure";
      if (typeof (error as { code?: unknown }).code === "string") {
        return "Database or transient processing failure";
      }
    }
    return "Transient processing failure";
  }
}
