import {
  Injectable,
  BadRequestException,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Octokit } from "@octokit/rest";
import { PrismaService } from "../prisma/prisma.service";
import { GitHubConfigService } from "./github-config.service";
import { BillingService } from "../billing/billing.service";

type SessionContext = {
  userId: string;
  organizationId: string;
};

type RepositoryRecord = {
  id: string;
  githubRepoId: bigint;
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  defaultBranch: string | null;
  primaryLanguage: string | null;
  visibility: string;
  installation: {
    installationId: bigint;
  };
};

type ActivityPoint = {
  date: string;
  value: number;
};

@Injectable()
export class GitHubAnalyticsService {
  private readonly cache = new Map<string, { expiresAt: number; value: unknown }>();
  private readonly cacheTtlMs = 5 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: GitHubConfigService,
    private readonly billing: BillingService,
  ) {}

  async getAnalytics(
    context: SessionContext,
    query: { start?: string; end?: string; repositoryId?: string; category?: string },
  ) {
    const range = this.parseRange(query.start, query.end);
    const category = this.parseCategory(query.category);
    const entitlements = await this.billing.getEffectiveEntitlements(
      context.organizationId,
    );
    const rangeDays =
      Math.floor((range.end.getTime() - range.start.getTime()) / 86_400_000) + 1;
    if (rangeDays > entitlements.historicalDays) {
      throw new BadRequestException(
        `The ${entitlements.name} plan includes ${entitlements.historicalDays} days of historical analytics.`,
      );
    }
    if (category === "health") {
      await this.billing.requireFeature(
        context.organizationId,
        "repositoryHealth",
      );
    }
    const repositoryId = query.repositoryId?.trim();
    if (repositoryId && repositoryId.length > 128) {
      throw new BadRequestException("Invalid repository filter");
    }

    const cacheKey = JSON.stringify({
      organizationId: context.organizationId,
      repositoryId: repositoryId ?? null,
      category,
      start: range.start.toISOString(),
      end: range.end.toISOString(),
    });
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const repositories = await this.prisma.connectedRepository.findMany({
      where: {
        disconnectedAt: null,
        id: repositoryId ?? undefined,
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
      orderBy: { fullName: "asc" },
    }) as RepositoryRecord[];

    if (repositoryId && repositories.length === 0) {
      throw new BadRequestException("Repository is not connected to this workspace");
    }

    const commitResults: Array<{
      repositoryId: string;
      repositoryName: string;
      commits: Array<{ sha: string; date: string; author: string | null }>;
    }> = [];
    const issueResults: Array<{
      repositoryId: string;
      repositoryName: string;
      issues: Array<Record<string, unknown>>;
    }> = [];
    const pullResults: Array<{
      repositoryId: string;
      repositoryName: string;
      pullRequests: Array<Record<string, unknown>>;
    }> = [];

    const inaccessible: Array<{ repositoryId: string; fullName: string; reason: string }> = [];
    const byInstallation = new Map<number, Octokit>();

    for (const repository of repositories) {
      const installationId = Number(repository.installation.installationId);
      let octokit = byInstallation.get(installationId);
      if (!octokit) {
        octokit = await this.config.createApp().getInstallationOctokit(installationId) as unknown as Octokit;
        byInstallation.set(installationId, octokit);
      }

      try {
        if (category === "all" || category === "commits" || category === "health") {
          const commits = await octokit.paginate(
            "GET /repos/{owner}/{repo}/commits",
            {
              owner: repository.owner,
              repo: repository.name,
              since: range.start.toISOString(),
              until: range.end.toISOString(),
              per_page: 100,
            },
          );
          commitResults.push({
            repositoryId: repository.id,
            repositoryName: repository.fullName,
            commits: commits
              .filter((commit) => commit.commit?.author?.date)
              .map((commit) => ({
                sha: commit.sha,
                date: commit.commit.author?.date ?? "",
                author:
                  commit.author?.login ??
                  commit.commit.author?.name ??
                  null,
              })),
          });
        }

        if (category === "all" || category === "issues" || category === "health") {
          const issues = await octokit.paginate(
            "GET /repos/{owner}/{repo}/issues",
            {
              owner: repository.owner,
              repo: repository.name,
              state: "all",
              sort: "updated",
              direction: "asc",
              per_page: 100,
            },
          );
          issueResults.push({
            repositoryId: repository.id,
            repositoryName: repository.fullName,
            issues: issues
              .filter((issue) => !("pull_request" in issue))
              .map((issue) => issue as unknown as Record<string, unknown>),
          });
        }

        if (category === "all" || category === "pull_requests" || category === "health") {
          const pullRequests = await octokit.paginate(
            "GET /repos/{owner}/{repo}/pulls",
            {
              owner: repository.owner,
              repo: repository.name,
              state: "all",
              sort: "updated",
              direction: "desc",
              per_page: 100,
            },
          );
          pullResults.push({
            repositoryId: repository.id,
            repositoryName: repository.fullName,
            pullRequests: pullRequests.map((pullRequest) =>
              pullRequest as unknown as Record<string, unknown>,
            ),
          });
        }
      } catch (error) {
        if (this.isRateLimited(error)) {
          throw new HttpException(
            "GitHub API rate limit exceeded. Please retry after the reset time.",
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        inaccessible.push({
          repositoryId: repository.id,
          fullName: repository.fullName,
          reason: this.describeGitHubError(error),
        });
      }
    }

    const allCommits = commitResults.flatMap((result) => result.commits);
    const allIssues = issueResults.flatMap((result) => result.issues);
    const allPullRequests = pullResults.flatMap((result) => result.pullRequests);

    const issuesOpened = allIssues.filter((issue) =>
      this.isDateInRange(this.stringValue(issue.created_at), range.start, range.end),
    );
    const issuesClosed = allIssues.filter((issue) =>
      this.isDateInRange(this.stringValue(issue.closed_at), range.start, range.end),
    );
    const openIssues = allIssues.filter((issue) => issue.state === "open");
    const unassignedIssues = openIssues.filter((issue) => {
      const assignees = issue.assignees;
      return !Array.isArray(assignees) || assignees.length === 0;
    });

    const openPullRequests = allPullRequests.filter(
      (pullRequest) => pullRequest.state === "open",
    );
    const mergedPullRequests = allPullRequests.filter((pullRequest) =>
      this.isDateInRange(this.stringValue(pullRequest.merged_at), range.start, range.end),
    );
    const closedPullRequests = allPullRequests.filter(
      (pullRequest) =>
        pullRequest.state === "closed" &&
        !pullRequest.merged_at &&
        this.isDateInRange(this.stringValue(pullRequest.closed_at), range.start, range.end),
    );

    const mergeDurations = mergedPullRequests
      .map((pullRequest) => {
        const created = this.dateValue(pullRequest.created_at);
        const merged = this.dateValue(pullRequest.merged_at);
        return created && merged ? (merged.getTime() - created.getTime()) / 86_400_000 : null;
      })
      .filter((duration): duration is number => duration !== null && duration >= 0);

    const stalePullRequests = openPullRequests.filter((pullRequest) => {
      const updated = this.dateValue(pullRequest.updated_at);
      return updated ? updated.getTime() < Date.now() - 30 * 86_400_000 : false;
    });

    const dailyCommits = this.groupDaily(
      allCommits.map((commit) => commit.date),
      range.start,
      range.end,
    );
    const issueCreated = this.groupDaily(
      issuesOpened.map((issue) => this.stringValue(issue.created_at) ?? ""),
      range.start,
      range.end,
    );
    const issueResolved = this.groupDaily(
      issuesClosed.map((issue) => this.stringValue(issue.closed_at) ?? ""),
      range.start,
      range.end,
    );

    const repositoryComparison = repositories.map((repository) => {
      const commits = commitResults.find((item) => item.repositoryId === repository.id);
      const issues = issueResults.find((item) => item.repositoryId === repository.id);
      const pullRequests = pullResults.find((item) => item.repositoryId === repository.id);
      return {
        repositoryId: repository.id,
        name: repository.fullName,
        commits: commits?.commits.length ?? 0,
        openIssues: (issues?.issues ?? []).filter((issue) => issue.state === "open").length,
        openPullRequests: (pullRequests?.pullRequests ?? []).filter(
          (pullRequest) => pullRequest.state === "open",
        ).length,
      };
    });

    const contributors = this.groupContributors(allCommits);

    const recentlyUpdated = repositories
      .map((repository) => {
        const commitDates = commitResults
          .find((item) => item.repositoryId === repository.id)
          ?.commits.map((commit) => commit.date) ?? [];
        const issueDates = (issueResults.find((item) => item.repositoryId === repository.id)?.issues ?? [])
          .map((issue) => this.stringValue(issue.updated_at))
          .filter((value): value is string => Boolean(value));
        const pullDates = (pullResults.find((item) => item.repositoryId === repository.id)?.pullRequests ?? [])
          .map((pullRequest) => this.stringValue(pullRequest.updated_at))
          .filter((value): value is string => Boolean(value));
        const dates = [...commitDates, ...issueDates, ...pullDates]
          .map((value) => this.dateValue(value))
          .filter((value): value is Date => Boolean(value))
          .sort((left, right) => right.getTime() - left.getTime());

        return {
          id: repository.id,
          name: repository.fullName,
          owner: repository.owner,
          description: repository.description,
          visibility: repository.visibility,
          defaultBranch: repository.defaultBranch,
          primaryLanguage: repository.primaryLanguage,
          unresolvedIssues: (issueResults.find((item) => item.repositoryId === repository.id)?.issues ?? [])
            .filter((issue) => issue.state === "open").length,
          pendingPullRequests: (pullResults.find((item) => item.repositoryId === repository.id)?.pullRequests ?? [])
            .filter((pullRequest) => pullRequest.state === "open").length,
          lastUpdated: dates[0]?.toISOString() ?? null,
        };
      })
      .sort((left, right) => {
        if (!left.lastUpdated) return 1;
        if (!right.lastUpdated) return -1;
        return right.lastUpdated.localeCompare(left.lastUpdated);
      });

    const result = {
      dateRange: {
        start: range.start.toISOString(),
        end: range.end.toISOString(),
        requestedStart: query.start ?? null,
        requestedEnd: query.end ?? null,
      },
      category,
      overview: {
        connectedRepositories: repositories.length,
        totalCommits: allCommits.length,
        openIssues: openIssues.length,
        closedIssues: issuesClosed.length,
        openPullRequests: openPullRequests.length,
      },
      commits: {
        daily: dailyCommits,
        weekly: this.groupWeekly(dailyCommits),
        monthly: this.groupMonthly(dailyCommits),
        repositoryComparison,
        contributors,
      },
      issues: {
        open: openIssues.length,
        closed: issuesClosed.length,
        created: issueCreated,
        resolved: issueResolved,
        unassigned: unassignedIssues.length,
        items: issueResults.flatMap((result) =>
          result.issues
            .filter((issue) => issue.state === "open" || this.isDateInRange(this.stringValue(issue.closed_at), range.start, range.end))
            .map((issue) => ({
              repositoryId: result.repositoryId,
              repository: result.repositoryName,
              number: Number(issue.number ?? 0),
              title: this.stringValue(issue.title) ?? "Untitled issue",
              state: this.stringValue(issue.state) ?? "unknown",
              author: this.stringValue((issue.user as Record<string, unknown> | undefined)?.login),
              labels: Array.isArray(issue.labels)
                ? issue.labels.map((label) => this.stringValue((label as Record<string, unknown>).name)).filter(Boolean)
                : [],
              createdAt: this.stringValue(issue.created_at),
              updatedAt: this.stringValue(issue.updated_at),
              closedAt: this.stringValue(issue.closed_at),
              url: this.stringValue(issue.html_url),
              assignees: Array.isArray(issue.assignees) ? issue.assignees.length : 0,
            })),
        ).sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "")),
      },
      pullRequests: {
        open: openPullRequests.length,
        merged: mergedPullRequests.length,
        closed: closedPullRequests.length,
        averageDaysToMerge:
          mergeDurations.length > 0
            ? Number(
                (
                  mergeDurations.reduce((sum, duration) => sum + duration, 0) /
                  mergeDurations.length
                ).toFixed(2),
              )
            : null,
        stale: stalePullRequests.length,
        items: pullResults.flatMap((result) =>
          result.pullRequests
            .filter((pullRequest) =>
              pullRequest.state === "open" ||
              this.isDateInRange(this.stringValue(pullRequest.merged_at), range.start, range.end) ||
              this.isDateInRange(this.stringValue(pullRequest.closed_at), range.start, range.end),
            )
            .map((pullRequest) => ({
              repositoryId: result.repositoryId,
              repository: result.repositoryName,
              number: Number(pullRequest.number ?? 0),
              title: this.stringValue(pullRequest.title) ?? "Untitled pull request",
              state: this.stringValue(pullRequest.state) ?? "unknown",
              author: this.stringValue((pullRequest.user as Record<string, unknown> | undefined)?.login),
              draft: Boolean(pullRequest.draft),
              createdAt: this.stringValue(pullRequest.created_at),
              updatedAt: this.stringValue(pullRequest.updated_at),
              closedAt: this.stringValue(pullRequest.closed_at),
              mergedAt: this.stringValue(pullRequest.merged_at),
              url: this.stringValue(pullRequest.html_url),
            })),
        ).sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "")),
      },
      repositoryHealth: recentlyUpdated,
      inaccessible,
    };

    this.cache.set(cacheKey, { expiresAt: Date.now() + this.cacheTtlMs, value: result });
    return result;
  }

  private parseRange(startValue?: string, endValue?: string) {
    const end = endValue ? this.parseDate(endValue, "end") : new Date();
    const start = startValue
      ? this.parseDate(startValue, "start")
      : new Date(end.getTime() - 29 * 86_400_000);
    if (start > end) {
      throw new BadRequestException("Start date must be before or equal to end date");
    }
    if (end.getTime() - start.getTime() > 366 * 86_400_000) {
      throw new BadRequestException("Date range cannot exceed 366 days");
    }
    end.setUTCHours(23, 59, 59, 999);
    return { start, end };
  }

  private parseDate(value: string, boundary: "start" | "end") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException("Dates must use YYYY-MM-DD format");
    }
    const date = new Date(`${value}T${boundary === "start" ? "00:00:00" : "23:59:59"}.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      throw new BadRequestException("Invalid date");
    }
    return date;
  }

  private parseCategory(category?: string) {
    const value = category ?? "all";
    if (!["all", "commits", "issues", "pull_requests", "health"].includes(value)) {
      throw new BadRequestException("Invalid activity category");
    }
    return value;
  }

  private groupDaily(values: string[], start: Date, end: Date): ActivityPoint[] {
    const counts = new Map<string, number>();
    for (const value of values) {
      const date = this.dateValue(value);
      if (date) {
        const key = date.toISOString().slice(0, 10);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    const result: ActivityPoint[] = [];
    const cursor = new Date(start);
    cursor.setUTCHours(0, 0, 0, 0);
    const last = new Date(end);
    last.setUTCHours(0, 0, 0, 0);
    while (cursor <= last) {
      const date = cursor.toISOString().slice(0, 10);
      result.push({ date, value: counts.get(date) ?? 0 });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return result;
  }

  private groupWeekly(daily: ActivityPoint[]): ActivityPoint[] {
    const result = new Map<string, number>();
    for (const point of daily) {
      const date = new Date(`${point.date}T00:00:00.000Z`);
      const day = date.getUTCDay();
      date.setUTCDate(date.getUTCDate() - ((day + 6) % 7));
      const key = date.toISOString().slice(0, 10);
      result.set(key, (result.get(key) ?? 0) + point.value);
    }
    return [...result.entries()].map(([date, value]) => ({ date, value }));
  }

  private groupMonthly(daily: ActivityPoint[]): ActivityPoint[] {
    const result = new Map<string, number>();
    for (const point of daily) {
      const key = point.date.slice(0, 7);
      result.set(key, (result.get(key) ?? 0) + point.value);
    }
    return [...result.entries()].map(([date, value]) => ({ date, value }));
  }

  private groupContributors(commits: Array<{ sha: string; date: string; author: string | null }>) {
    const counts = new Map<string, number>();
    for (const commit of commits) {
      const name = commit.author ?? "Unknown contributor";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, commitsCount]) => ({ name, commits: commitsCount }))
      .sort((left, right) => right.commits - left.commits)
      .slice(0, 20);
  }

  private isDateInRange(value: string | null, start: Date, end: Date) {
    const date = this.dateValue(value);
    return date ? date >= start && date <= end : false;
  }

  private dateValue(value: unknown): Date | null {
    if (typeof value !== "string" || !value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private stringValue(value: unknown): string | null {
    return typeof value === "string" ? value : null;
  }

  private describeGitHubError(error: unknown): string {
    if (error instanceof HttpException) return error.message;
    if (typeof error === "object" && error && "status" in error) {
      const status = Number((error as { status?: number }).status);
      if (status === 403 || status === 429) {
        if (status === 429) return "GitHub API rate limit exceeded";
        return "Repository access restriction";
      }
      if (status === 404) return "Repository is inaccessible";
      if (status >= 500) return "GitHub API temporarily unavailable";
    }
    return "Repository analytics could not be loaded";
  }

  private isRateLimited(error: unknown): boolean {
    if (typeof error !== "object" || !error) return false;
    const status = Number((error as { status?: number }).status);
    if (status === 429) return true;
    if (status !== 403) return false;
    const headers = (error as { response?: { headers?: Record<string, string> } }).response?.headers;
    return headers?.["x-ratelimit-remaining"] === "0";
  }
}
