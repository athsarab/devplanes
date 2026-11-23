import {
  HealthDimension,
  RepositoryHealthConfig,
  REPOSITORY_HEALTH_CONFIG,
  validateHealthConfig,
} from "./repository-health.config";

export type HealthEvidence = {
  code: string;
  label: string;
  value: number | string | boolean | null;
  available: boolean;
};

export type DimensionScore = {
  key: HealthDimension;
  label: string;
  score: number | null;
  weight: number;
  evidence: HealthEvidence[];
  positiveFactors: string[];
  negativeFactors: string[];
};

export type RepositoryHealthInput = {
  calculatedAt: Date;
  archived: boolean;
  metadataAvailable: boolean;
  lastCommitAt: Date | null;
  lastActivityAt: Date | null;
  commitsCurrentPeriod: number | null;
  commitsPreviousPeriod: number | null;
  openIssues: number | null;
  oldIssues: number | null;
  unassignedIssues: number | null;
  inactiveIssues: number | null;
  resolvedIssuesCurrentPeriod: number | null;
  resolvedIssuesPreviousPeriod: number | null;
  openPullRequests: number | null;
  stalePullRequests: number | null;
  waitingForReviewPullRequests: number | null;
  waitingForChangesPullRequests: number | null;
  mergedPullRequestsCurrentPeriod: number | null;
  mergedPullRequestsPreviousPeriod: number | null;
  reviewTurnaroundDays: number | null;
};

export type RepositoryHealthResult = {
  overallScore: number;
  category: "Excellent" | "Good" | "Needs Attention" | "Critical";
  dimensions: DimensionScore[];
  positiveFactors: string[];
  negativeFactors: string[];
  evidence: HealthEvidence[];
  recommendations: string[];
  calculatedAt: string;
  dataCompleteness: {
    status: "complete" | "partial" | "insufficient";
    availableDimensions: number;
    totalDimensions: number;
    unavailableDimensions: HealthDimension[];
  };
};

const labels: Record<HealthDimension, string> = {
  repositoryInactivity: "Repository inactivity",
  issueManagement: "Issue management",
  pullRequestReview: "Pull request review",
  outstandingPullRequests: "Outstanding pull requests",
  developmentActivity: "Development activity",
};

export class RepositoryHealthEngine {
  constructor(private readonly config: RepositoryHealthConfig = REPOSITORY_HEALTH_CONFIG) {
    validateHealthConfig(config);
  }

  calculate(input: RepositoryHealthInput): RepositoryHealthResult {
    const dimensions = [
      this.scoreInactivity(input),
      this.scoreIssues(input),
      this.scorePullRequestReview(input),
      this.scoreOutstandingPullRequests(input),
      this.scoreDevelopment(input),
    ];

    const unavailable = dimensions
      .filter((dimension) => dimension.score === null)
      .map((dimension) => dimension.key);
    const available = dimensions.filter((dimension) => dimension.score !== null);
    const availableWeight = available.reduce((sum, dimension) => sum + dimension.weight, 0);
    const weightedScore = available.reduce(
      (sum, dimension) => sum + (dimension.score as number) * dimension.weight,
      0,
    );
    const normalized = availableWeight > 0
      ? Math.round(weightedScore / availableWeight)
      : 0;
    const overallScore = available.length === 0 ? 0 : normalized;

    const completeness =
      unavailable.length === 0
        ? "complete"
        : unavailable.length < dimensions.length
          ? "partial"
          : "insufficient";

    const positiveFactors = dimensions.flatMap((dimension) => dimension.positiveFactors);
    const negativeFactors = dimensions.flatMap((dimension) => dimension.negativeFactors);
    const evidence = dimensions.flatMap((dimension) =>
      dimension.evidence.map((item) => ({ ...item, code: `${dimension.key}.${item.code}` })),
    );
    const recommendations = this.recommendations(dimensions);

    return {
      overallScore,
      category: this.category(overallScore),
      dimensions,
      positiveFactors,
      negativeFactors,
      evidence,
      recommendations,
      calculatedAt: input.calculatedAt.toISOString(),
      dataCompleteness: {
        status: completeness,
        availableDimensions: available.length,
        totalDimensions: dimensions.length,
        unavailableDimensions: unavailable,
      },
    };
  }

  private scoreInactivity(input: RepositoryHealthInput): DimensionScore {
    const evidence: HealthEvidence[] = [
      {
        code: "lastCommit",
        label: "Last meaningful commit",
        value: input.lastCommitAt?.toISOString() ?? null,
        available: input.lastCommitAt !== null,
      },
      {
        code: "lastActivity",
        label: "Last repository activity",
        value: input.lastActivityAt?.toISOString() ?? null,
        available: input.lastActivityAt !== null,
      },
    ];
    if (input.archived) {
      return {
        key: "repositoryInactivity",
        label: labels.repositoryInactivity,
        score: 100,
        weight: this.config.weights.repositoryInactivity,
        evidence,
        positiveFactors: ["The repository is archived; inactivity is not treated as an ordinary risk."],
        negativeFactors: [],
      };
    }
    if (!input.metadataAvailable || !input.lastCommitAt || !input.lastActivityAt) {
      return this.unavailable("repositoryInactivity", evidence);
    }
    const now = input.calculatedAt.getTime();
    const commitAge = this.daysSince(input.lastCommitAt, now);
    const activityAge = this.daysSince(input.lastActivityAt, now);
    const age = Math.max(commitAge, activityAge);
    let score = 100;
    if (age >= this.config.thresholds.inactivity.criticalDays) score = 35;
    else if (age >= this.config.thresholds.inactivity.watchDays) score = 65;
    else if (age >= this.config.thresholds.inactivity.recentDays) score = 85;

    const positiveFactors: string[] = [];
    const negativeFactors: string[] = [];
    if (age <= this.config.thresholds.inactivity.recentDays) {
      positiveFactors.push(`The latest repository activity is within ${this.config.thresholds.inactivity.recentDays} days.`);
    } else {
      negativeFactors.push(`Meaningful repository activity is ${age} days old.`);
    }
    return {
      key: "repositoryInactivity",
      label: labels.repositoryInactivity,
      score,
      weight: this.config.weights.repositoryInactivity,
      evidence: [
        ...evidence,
        { code: "ageDays", label: "Oldest recent activity age", value: age, available: true },
      ],
      positiveFactors,
      negativeFactors,
    };
  }

  private scoreIssues(input: RepositoryHealthInput): DimensionScore {
    const evidence: HealthEvidence[] = [
      { code: "open", label: "Open issues", value: input.openIssues, available: input.openIssues !== null },
      { code: "old", label: "Issues older than threshold", value: input.oldIssues, available: input.oldIssues !== null },
      { code: "unassigned", label: "Unassigned issues", value: input.unassignedIssues, available: input.unassignedIssues !== null },
      { code: "inactive", label: "Issues without recent updates", value: input.inactiveIssues, available: input.inactiveIssues !== null },
      { code: "resolvedCurrent", label: "Issues resolved in current period", value: input.resolvedIssuesCurrentPeriod, available: input.resolvedIssuesCurrentPeriod !== null },
      { code: "resolvedPrevious", label: "Issues resolved in previous period", value: input.resolvedIssuesPreviousPeriod, available: input.resolvedIssuesPreviousPeriod !== null },
    ];
    if (input.openIssues === null || input.oldIssues === null ||
        input.unassignedIssues === null || input.inactiveIssues === null) {
      return this.unavailable("issueManagement", evidence);
    }
    let score = 100;
    if (input.openIssues > 0) {
      score -= Math.min(30, input.openIssues * 2);
    }
    score -= Math.min(25, input.oldIssues * 5);
    score -= Math.min(20, input.unassignedIssues * 4);
    score -= Math.min(25, input.inactiveIssues * 5);
    score = Math.max(0, score);

    const positiveFactors: string[] = [];
    const negativeFactors: string[] = [];
    if (input.openIssues === 0) positiveFactors.push("There are no open issues.");
    if (input.oldIssues === 0) positiveFactors.push("No issues exceed the configured old-issue threshold.");
    if (input.unassignedIssues === 0) positiveFactors.push("No open issues are unassigned.");
    if (input.oldIssues > 0) negativeFactors.push(`${input.oldIssues} issue(s) are older than ${this.config.thresholds.issues.oldDays} days.`);
    if (input.inactiveIssues > 0) negativeFactors.push(`${input.inactiveIssues} issue(s) have not been updated in ${this.config.thresholds.issues.inactiveDays} days.`);
    if (input.unassignedIssues > 0) negativeFactors.push(`${input.unassignedIssues} open issue(s) are unassigned.`);
    return {
      key: "issueManagement",
      label: labels.issueManagement,
      score,
      weight: this.config.weights.issueManagement,
      evidence,
      positiveFactors,
      negativeFactors,
    };
  }

  private scorePullRequestReview(input: RepositoryHealthInput): DimensionScore {
    const evidence: HealthEvidence[] = [
      { code: "waitingReview", label: "Pull requests waiting for review", value: input.waitingForReviewPullRequests, available: input.waitingForReviewPullRequests !== null },
      { code: "waitingChanges", label: "Pull requests waiting for requested changes", value: input.waitingForChangesPullRequests, available: input.waitingForChangesPullRequests !== null },
      { code: "stale", label: "Stale pull requests", value: input.stalePullRequests, available: input.stalePullRequests !== null },
      { code: "turnaroundDays", label: "Median review turnaround", value: input.reviewTurnaroundDays, available: input.reviewTurnaroundDays !== null },
    ];
    if (input.waitingForReviewPullRequests === null ||
        input.waitingForChangesPullRequests === null ||
        input.stalePullRequests === null ||
        input.reviewTurnaroundDays === null) {
      return this.unavailable("pullRequestReview", evidence);
    }
    let score = 100;
    score -= Math.min(35, input.waitingForReviewPullRequests * 7);
    score -= Math.min(25, input.waitingForChangesPullRequests * 5);
    score -= Math.min(25, input.stalePullRequests * 5);
    if (input.reviewTurnaroundDays > this.config.thresholds.pullRequests.reviewDelayDays) {
      score -= Math.min(15, Math.round((input.reviewTurnaroundDays - this.config.thresholds.pullRequests.reviewDelayDays) * 2));
    }
    score = Math.max(0, score);
    const positiveFactors: string[] = [];
    const negativeFactors: string[] = [];
    if (input.waitingForReviewPullRequests === 0) positiveFactors.push("No pull requests are waiting for review.");
    if (input.reviewTurnaroundDays <= this.config.thresholds.pullRequests.reviewDelayDays) {
      positiveFactors.push(`Median review turnaround is within ${this.config.thresholds.pullRequests.reviewDelayDays} days.`);
    }
    if (input.waitingForReviewPullRequests > 0) negativeFactors.push(`${input.waitingForReviewPullRequests} pull request(s) are waiting for review.`);
    if (input.waitingForChangesPullRequests > 0) negativeFactors.push(`${input.waitingForChangesPullRequests} pull request(s) are waiting on requested changes.`);
    if (input.stalePullRequests > 0) negativeFactors.push(`${input.stalePullRequests} pull request(s) are stale.`);
    if (input.reviewTurnaroundDays > this.config.thresholds.pullRequests.reviewDelayDays) {
      negativeFactors.push(`Median review turnaround is ${input.reviewTurnaroundDays} days.`);
    }
    return {
      key: "pullRequestReview",
      label: labels.pullRequestReview,
      score,
      weight: this.config.weights.pullRequestReview,
      evidence,
      positiveFactors,
      negativeFactors,
    };
  }

  private scoreOutstandingPullRequests(input: RepositoryHealthInput): DimensionScore {
    const evidence: HealthEvidence[] = [
      { code: "open", label: "Open pull requests", value: input.openPullRequests, available: input.openPullRequests !== null },
      { code: "stale", label: "Stale pull requests", value: input.stalePullRequests, available: input.stalePullRequests !== null },
    ];
    if (input.openPullRequests === null || input.stalePullRequests === null) {
      return this.unavailable("outstandingPullRequests", evidence);
    }
    let score = 100;
    score -= Math.min(60, input.openPullRequests * 6);
    score -= Math.min(40, input.stalePullRequests * 10);
    score = Math.max(0, score);
    const positiveFactors: string[] = [];
    const negativeFactors: string[] = [];
    if (input.openPullRequests === 0) positiveFactors.push("There are no outstanding pull requests.");
    if (input.stalePullRequests === 0) positiveFactors.push("No pull requests are stale.");
    if (input.openPullRequests > 0) negativeFactors.push(`${input.openPullRequests} pull request(s) remain open.`);
    if (input.stalePullRequests > 0) negativeFactors.push(`${input.stalePullRequests} open pull request(s) exceed the stale threshold.`);
    return {
      key: "outstandingPullRequests",
      label: labels.outstandingPullRequests,
      score,
      weight: this.config.weights.outstandingPullRequests,
      evidence,
      positiveFactors,
      negativeFactors,
    };
  }

  private scoreDevelopment(input: RepositoryHealthInput): DimensionScore {
    const evidence: HealthEvidence[] = [
      { code: "commitsCurrent", label: "Commits in current period", value: input.commitsCurrentPeriod, available: input.commitsCurrentPeriod !== null },
      { code: "commitsPrevious", label: "Commits in previous period", value: input.commitsPreviousPeriod, available: input.commitsPreviousPeriod !== null },
      { code: "mergedCurrent", label: "Merged pull requests in current period", value: input.mergedPullRequestsCurrentPeriod, available: input.mergedPullRequestsCurrentPeriod !== null },
      { code: "resolvedCurrent", label: "Resolved issues in current period", value: input.resolvedIssuesCurrentPeriod, available: input.resolvedIssuesCurrentPeriod !== null },
    ];
    if (input.commitsCurrentPeriod === null || input.commitsPreviousPeriod === null ||
        input.mergedPullRequestsCurrentPeriod === null || input.resolvedIssuesCurrentPeriod === null) {
      return this.unavailable("developmentActivity", evidence);
    }
    const previousMerged = input.mergedPullRequestsPreviousPeriod ?? 0;
    const previousResolved = input.resolvedIssuesPreviousPeriod ?? 0;
    if (
      input.commitsCurrentPeriod === 0 &&
      input.commitsPreviousPeriod === 0 &&
      input.mergedPullRequestsCurrentPeriod === 0 &&
      previousMerged === 0 &&
      input.resolvedIssuesCurrentPeriod === 0 &&
      previousResolved === 0
    ) {
      return this.unavailable("developmentActivity", evidence);
    }
    const currentDelivery =
      input.commitsCurrentPeriod + input.mergedPullRequestsCurrentPeriod * 3 +
      input.resolvedIssuesCurrentPeriod * 2;
    const previousDelivery =
      input.commitsPreviousPeriod + (input.mergedPullRequestsPreviousPeriod ?? 0) * 3 +
      (input.resolvedIssuesPreviousPeriod ?? 0) * 2;
    let trendScore = 80;
    if (previousDelivery > 0) {
      const ratio = currentDelivery / previousDelivery;
      trendScore = ratio >= 1 ? 100 : ratio >= 0.75 ? 85 : ratio >= 0.5 ? 65 : 45;
    } else if (currentDelivery > 0) {
      trendScore = 100;
    } else {
      trendScore = 60;
    }

    const positiveFactors: string[] = [];
    const negativeFactors: string[] = [];
    if (trendScore >= 85) positiveFactors.push("Delivery activity is stable or improving across commits, merges and issue resolution.");
    if (trendScore < 65) negativeFactors.push("Delivery activity has declined compared with the previous period.");
    if (input.resolvedIssuesCurrentPeriod > 0) positiveFactors.push(`${input.resolvedIssuesCurrentPeriod} issue(s) were resolved in the current period.`);
    if (input.mergedPullRequestsCurrentPeriod === 0) negativeFactors.push("No pull requests were merged in the current period.");
    return {
      key: "developmentActivity",
      label: labels.developmentActivity,
      score: trendScore,
      weight: this.config.weights.developmentActivity,
      evidence,
      positiveFactors,
      negativeFactors,
    };
  }

  private unavailable(key: HealthDimension, evidence: HealthEvidence[]): DimensionScore {
    return {
      key,
      label: labels[key],
      score: null,
      weight: this.config.weights[key],
      evidence,
      positiveFactors: [],
      negativeFactors: [],
    };
  }

  private daysSince(date: Date, now: number) {
    return Math.max(0, Math.floor((now - date.getTime()) / 86_400_000));
  }

  private category(score: number): RepositoryHealthResult["category"] {
    if (score >= this.config.categoryBoundaries.excellent) return "Excellent";
    if (score >= this.config.categoryBoundaries.good) return "Good";
    if (score >= this.config.categoryBoundaries.needsAttention) return "Needs Attention";
    return "Critical";
  }

  private recommendations(dimensions: DimensionScore[]) {
    const recommendations: string[] = [];
    for (const dimension of dimensions) {
      if (dimension.negativeFactors.length === 0) continue;
      if (dimension.key === "repositoryInactivity") recommendations.push("Review whether the repository is intentionally dormant or requires ownership.");
      if (dimension.key === "issueManagement") recommendations.push("Triage stale and unassigned issues, and assign recent updates.");
      if (dimension.key === "pullRequestReview") recommendations.push("Assign reviewers and address requested changes promptly.");
      if (dimension.key === "outstandingPullRequests") recommendations.push("Close or merge outstanding pull requests and reduce stale work.");
      if (dimension.key === "developmentActivity") recommendations.push("Review delivery trends across commits, merges and resolved issues.");
    }
    if (recommendations.length === 0) {
      recommendations.push("Maintain current review, issue and delivery practices.");
    }
    return recommendations;
  }
}
