import {
  BottleneckConfig,
  BOTTLENECK_CONFIG,
  validateBottleneckConfig,
} from "./bottleneck.config";

export type LifecycleEvent = {
  eventType:
    | "created"
    | "review_requested"
    | "first_review"
    | "changes_requested"
    | "changes_submitted"
    | "approved"
    | "merged"
    | "closed"
    | "reopened"
    | "ready_for_review"
    | "submitted"
    | "issue_created"
    | "issue_closed"
    | "issue_reopened"
    | "issue_updated";
  occurredAt: Date;
  sourceDeliveryId: string;
};

export type PullRequestInput = {
  repositoryId: string;
  repositoryName: string;
  number: number;
  title: string;
  state: "open" | "closed";
  createdAt: Date | null;
  updatedAt: Date | null;
  mergedAt: Date | null;
  closedAt: Date | null;
  branchDeleted: boolean;
  timeline: LifecycleEvent[];
  historyComplete: boolean;
};

export type IssueInput = {
  repositoryId: string;
  repositoryName: string;
  number: number;
  title: string;
  state: "open" | "closed";
  createdAt: Date | null;
  updatedAt: Date | null;
  closedAt: Date | null;
  timeline: LifecycleEvent[];
  historyComplete: boolean;
};

export type BottleneckFindingInput = {
  findingType: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  repositoryId: string;
  repositoryName: string;
  referenceType: "pull_request" | "issue" | "repository";
  referenceNumber: number | null;
  evidence: Record<string, unknown>;
  suggestedAction: string;
};

export type DevelopmentBottleneckResult = {
  calculatedAt: string;
  metrics: {
    openPullRequests: number;
    stalePullRequests: number;
    awaitingReviewPullRequests: number;
    changesRequestedPullRequests: number;
    reviewQueueSize: number;
    timeToFirstReview: number | null;
    reviewTurnaround: number | null;
    waitingForChangesElapsed: number | null;
    timeToMerge: number | null;
    issueResolutionTime: number | null;
    issueAging: number | null;
  };
  findings: BottleneckFindingInput[];
  incompleteHistory: Array<{
    repositoryId: string;
    referenceType: "pull_request" | "issue";
    referenceNumber: number;
    reason: string;
  }>;
};

export class BottleneckEngine {
  constructor(private readonly config: BottleneckConfig = BOTTLENECK_CONFIG) {
    validateBottleneckConfig(config);
  }

  calculate(input: {
    calculatedAt: Date;
    pullRequests: PullRequestInput[];
    issues: IssueInput[];
    reviewTurnaroundPreviousHours?: number | null;
  }): DevelopmentBottleneckResult {
    const now = input.calculatedAt;
    const findings: BottleneckFindingInput[] = [];
    const incompleteHistory: DevelopmentBottleneckResult["incompleteHistory"] = [];
    const openPullRequests = input.pullRequests.filter((pr) => pr.state === "open");
    const allFirstReviewTimes: number[] = [];
    const allTurnaroundTimes: number[] = [];
    const allWaitingChangesTimes: number[] = [];
    const allMergeTimes: number[] = [];
    const allIssueResolutionTimes: number[] = [];
    const issueAges: number[] = [];
    let stalePullRequests = 0;
    let awaitingReview = 0;
    let changesRequested = 0;

    for (const pr of input.pullRequests) {
      if (!pr.historyComplete) {
        incompleteHistory.push({
          repositoryId: pr.repositoryId,
          referenceType: "pull_request",
          referenceNumber: pr.number,
          reason: "The PR lifecycle timeline is incomplete; missing transitions are unavailable.",
        });
      }

      const timeline = this.uniqueSortedEvents(pr.timeline);
      const created = pr.createdAt ?? this.findEvent(timeline, "created");
      const firstReview = this.firstEvent(timeline, ["first_review", "submitted", "approved"]);
      const merged = pr.mergedAt ?? this.findEvent(timeline, "merged");
      const branchMissing = pr.branchDeleted;

      if (created && firstReview) {
        allFirstReviewTimes.push(this.elapsedHours(created, firstReview));
      }
      if (created && merged && !branchMissing) {
        allMergeTimes.push(this.elapsedHours(created, merged));
      }

      if (pr.state === "open") {
        const branchDeleted = pr.branchDeleted;
        const latestReview = [...timeline]
          .reverse()
          .find((event) =>
            event.eventType === "first_review" ||
            event.eventType === "submitted" ||
            event.eventType === "approved" ||
            event.eventType === "changes_requested");
        if (latestReview?.eventType === "changes_requested") {
          changesRequested++;
          const elapsed = this.elapsedHours(latestReview.occurredAt, now);
          allWaitingChangesTimes.push(elapsed);
          if (elapsed >= this.config.thresholds.requestedChangesElapsedHours) {
            findings.push({
              findingType: "PR_BLOCKED_BY_REQUESTED_CHANGES",
              severity: elapsed >= this.config.thresholds.requestedChangesElapsedHours * 2 ? "HIGH" : "MEDIUM",
              repositoryId: pr.repositoryId,
              repositoryName: pr.repositoryName,
              referenceType: "pull_request",
              referenceNumber: pr.number,
              evidence: {
                elapsedHours: elapsed,
                elapsedWorkingHours: this.workingHours(latestReview.occurredAt, now),
                thresholdHours: this.config.thresholds.requestedChangesElapsedHours,
                branchDeleted,
                historyComplete: pr.historyComplete,
                latestState: "changes_requested",
              },
              suggestedAction: "Review the requested changes and confirm whether the PR can proceed.",
            });
          }
        }

        if (!firstReview && pr.historyComplete && created) {
          awaitingReview++;
          const elapsed = this.elapsedHours(created, now);
          if (elapsed >= this.config.thresholds.waitingFirstReviewElapsedHours) {
            findings.push({
              findingType: "PR_WAITING_FOR_FIRST_REVIEW",
              severity: elapsed >= this.config.thresholds.waitingFirstReviewElapsedHours * 2 ? "HIGH" : "MEDIUM",
              repositoryId: pr.repositoryId,
              repositoryName: pr.repositoryName,
              referenceType: "pull_request",
              referenceNumber: pr.number,
              evidence: {
                elapsedHours: elapsed,
                elapsedWorkingHours: this.workingHours(created, now),
                thresholdHours: this.config.thresholds.waitingFirstReviewElapsedHours,
                branchDeleted,
                historyComplete: true,
              },
              suggestedAction: "Confirm whether a reviewer is needed and whether the PR is ready to proceed.",
            });
          }
        }

        if (pr.updatedAt) {
          const elapsed = this.elapsedHours(pr.updatedAt, now);
          if (elapsed >= this.config.thresholds.noActivityElapsedHours) {
            stalePullRequests++;
            findings.push({
              findingType: "PR_NO_ACTIVITY",
              severity: elapsed >= this.config.thresholds.stalePullRequestElapsedHours ? "HIGH" : "MEDIUM",
              repositoryId: pr.repositoryId,
              repositoryName: pr.repositoryName,
              referenceType: "pull_request",
              referenceNumber: pr.number,
              evidence: {
                lastActivityAt: pr.updatedAt.toISOString(),
                elapsedHours: elapsed,
                elapsedWorkingHours: this.workingHours(pr.updatedAt, now),
                thresholdHours: this.config.thresholds.noActivityElapsedHours,
                branchDeleted,
                historyComplete: pr.historyComplete,
              },
              suggestedAction: branchDeleted
                ? "Confirm whether this PR should be closed because its branch is deleted."
                : "Check whether the PR is blocked, superseded or ready for follow-up.",
            });
          }
        }

        if (latestReview?.eventType === "approved" || latestReview?.eventType === "changes_requested") {
          // These states are used for queue counts and requested-change findings.
        } else if (firstReview) {
          // An existing first review is not the same as waiting for a first review.
        }
      }

      const reviewEvents = timeline.filter((event) =>
        event.eventType === "first_review" ||
        event.eventType === "submitted" ||
        event.eventType === "approved");
      if (created && reviewEvents.length > 0) {
        const latestReview = [...reviewEvents].sort((left, right) =>
          left.occurredAt.getTime() - right.occurredAt.getTime())[0];
        allTurnaroundTimes.push(this.elapsedHours(created, latestReview.occurredAt));
      }
    }

    for (const issue of input.issues) {
      if (!issue.historyComplete) {
        incompleteHistory.push({
          repositoryId: issue.repositoryId,
          referenceType: "issue",
          referenceNumber: issue.number,
          reason: "The issue lifecycle timeline is incomplete; resolution or aging evidence may be unavailable.",
        });
      }
      if (issue.createdAt) {
        const age = this.elapsedHours(issue.createdAt, now);
        if (issue.state === "open") {
          issueAges.push(age);
          if (age >= this.config.thresholds.issueOldElapsedHours) {
            findings.push({
              findingType: "ISSUE_AGING",
              severity: age >= this.config.thresholds.issueOldElapsedHours * 2 ? "HIGH" : "MEDIUM",
              repositoryId: issue.repositoryId,
              repositoryName: issue.repositoryName,
              referenceType: "issue",
              referenceNumber: issue.number,
              evidence: {
                ageElapsedHours: age,
                ageWorkingHours: this.workingHours(issue.createdAt, now),
                thresholdHours: this.config.thresholds.issueOldElapsedHours,
                historyComplete: issue.historyComplete,
              },
              suggestedAction: "Review the issue scope, ownership and whether it should remain open.",
            });
          }
        } else if (issue.closedAt) {
          allIssueResolutionTimes.push(this.elapsedHours(issue.createdAt, issue.closedAt));
        }
      }
      if (issue.state === "open" && issue.updatedAt) {
        const inactive = this.elapsedHours(issue.updatedAt, now);
        if (inactive >= this.config.thresholds.issueInactiveElapsedHours) {
          findings.push({
            findingType: "ISSUE_NO_RECENT_ACTIVITY",
            severity: inactive >= this.config.thresholds.issueInactiveElapsedHours * 2 ? "HIGH" : "MEDIUM",
            repositoryId: issue.repositoryId,
            repositoryName: issue.repositoryName,
            referenceType: "issue",
            referenceNumber: issue.number,
            evidence: {
              lastActivityAt: issue.updatedAt.toISOString(),
              elapsedHours: inactive,
              elapsedWorkingHours: this.workingHours(issue.updatedAt, now),
              thresholdHours: this.config.thresholds.issueInactiveElapsedHours,
              historyComplete: issue.historyComplete,
            },
            suggestedAction: "Review the issue for missing context, blockers or a stale status.",
          });
        }
      }
    }

    const reviewQueueSize = openPullRequests.length;
    if (reviewQueueSize >= this.config.thresholds.largeReviewQueue) {
      findings.push({
        findingType: "LARGE_REVIEW_QUEUE",
        severity: reviewQueueSize >= this.config.thresholds.largeReviewQueue * 2 ? "CRITICAL" : "HIGH",
        repositoryId: input.pullRequests[0]?.repositoryId ?? "unknown",
        repositoryName: input.pullRequests[0]?.repositoryName ?? "Workspace",
        referenceType: "repository",
        referenceNumber: null,
        evidence: {
          openPullRequests: reviewQueueSize,
          threshold: this.config.thresholds.largeReviewQueue,
        },
        suggestedAction: "Review and prioritize the repository pull request queue.",
      });
    }

    const currentTurnaround = this.median(allTurnaroundTimes);
    if (
      currentTurnaround !== null &&
      input.reviewTurnaroundPreviousHours !== null &&
      input.reviewTurnaroundPreviousHours !== undefined &&
      currentTurnaround >
        input.reviewTurnaroundPreviousHours *
          this.config.thresholds.reviewTurnaroundIncreaseRatio
    ) {
      findings.push({
        findingType: "REVIEW_TURNAROUND_INCREASING",
        severity: "MEDIUM",
        repositoryId: input.pullRequests[0]?.repositoryId ?? "unknown",
        repositoryName: input.pullRequests[0]?.repositoryName ?? "Workspace",
        referenceType: "repository",
        referenceNumber: null,
        evidence: {
          currentMedianElapsedHours: currentTurnaround,
          previousMedianElapsedHours: input.reviewTurnaroundPreviousHours,
          increaseRatioThreshold: this.config.thresholds.reviewTurnaroundIncreaseRatio,
        },
        suggestedAction: "Review the review queue and staffing or process constraints for slower turnarounds.",
      });
    }

    return {
      calculatedAt: now.toISOString(),
      metrics: {
        openPullRequests: openPullRequests.length,
        stalePullRequests,
        awaitingReviewPullRequests: awaitingReview,
        changesRequestedPullRequests: changesRequested,
        reviewQueueSize,
        timeToFirstReview: this.median(allFirstReviewTimes),
        reviewTurnaround: this.median(allTurnaroundTimes),
        waitingForChangesElapsed: this.median(allWaitingChangesTimes),
        timeToMerge: this.median(allMergeTimes),
        issueResolutionTime: this.median(allIssueResolutionTimes),
        issueAging: issueAges.length > 0 ? this.median(issueAges) : null,
      },
      findings: findings.sort((left, right) =>
        left.repositoryName.localeCompare(right.repositoryName) ||
        left.findingType.localeCompare(right.findingType) ||
        (left.referenceNumber ?? 0) - (right.referenceNumber ?? 0)),
      incompleteHistory,
    };
  }

  elapsedHours(start: Date, end: Date) {
    return Math.max(0, (end.getTime() - start.getTime()) / 3_600_000);
  }

  workingHours(start: Date, end: Date) {
    if (end <= start) return 0;
    let hours = 0;
    const cursor = new Date(start);
    cursor.setUTCSeconds(0, 0);
    while (cursor < end) {
      const weekday = cursor.getUTCDay();
      const hour = cursor.getUTCHours();
      if (this.config.workingHours.weekdaysUtc.includes(weekday) &&
          hour >= this.config.workingHours.startHourUtc &&
          hour < this.config.workingHours.endHourUtc) {
        hours++;
      }
      cursor.setUTCHours(cursor.getUTCHours() + 1);
    }
    return hours;
  }

  private uniqueSortedEvents(events: LifecycleEvent[]) {
    const unique = new Map<string, LifecycleEvent>();
    for (const event of events) {
      const key = `${event.eventType}:${event.occurredAt.toISOString()}:${event.sourceDeliveryId}`;
      if (!unique.has(key)) unique.set(key, event);
    }
    return [...unique.values()].sort((left, right) =>
      left.occurredAt.getTime() - right.occurredAt.getTime());
  }

  private findEvent(events: LifecycleEvent[], type: LifecycleEvent["eventType"]) {
    return events.find((event) => event.eventType === type)?.occurredAt ?? null;
  }

  private firstEvent(events: LifecycleEvent[], types: LifecycleEvent["eventType"][]) {
    return events.find((event) => types.includes(event.eventType))?.occurredAt ?? null;
  }

  private median(values: number[]) {
    if (values.length === 0) return null;
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    const result = sorted.length % 2 === 1
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
    return Math.round(result * 10) / 10;
  }
}
