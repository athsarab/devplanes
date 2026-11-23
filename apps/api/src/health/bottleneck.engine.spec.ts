import { BottleneckEngine, PullRequestInput, IssueInput } from "./bottleneck.engine";

const now = new Date("2026-11-22T12:00:00.000Z");

function pr(overrides: Partial<PullRequestInput> = {}): PullRequestInput {
  return {
    repositoryId: "repo-1",
    repositoryName: "acme/service",
    number: 42,
    title: "Test pull request",
    state: "open",
    createdAt: new Date("2026-11-20T12:00:00.000Z"),
    updatedAt: new Date("2026-11-22T11:00:00.000Z"),
    mergedAt: null,
    closedAt: null,
    branchDeleted: false,
    timeline: [
      { eventType: "created", occurredAt: new Date("2026-11-20T12:00:00.000Z"), sourceDeliveryId: "delivery-1" },
    ],
    historyComplete: true,
    ...overrides,
  };
}

describe("BottleneckEngine", () => {
  const engine = new BottleneckEngine();

  it("marks missing first review history as unavailable instead of a confirmed delay", () => {
    const result = engine.calculate({
      calculatedAt: now,
      pullRequests: [pr({ historyComplete: false })],
      issues: [],
    });
    expect(result.incompleteHistory).toHaveLength(1);
    expect(result.findings.some((finding) => finding.findingType === "PR_WAITING_FOR_FIRST_REVIEW")).toBe(false);
  });

  it("does not assume a missing review for an open PR with complete history", () => {
    const result = engine.calculate({
      calculatedAt: now,
      pullRequests: [pr({ historyComplete: true })],
      issues: [],
    });
    expect(result.metrics.awaitingReviewPullRequests).toBe(1);
  });

  it("handles reopened PRs without a duplicate merged lifecycle state", () => {
    const merged = new Date("2026-11-21T10:00:00.000Z");
    const reopened = new Date("2026-11-22T10:00:00.000Z");
    const result = engine.calculate({
      calculatedAt: now,
      pullRequests: [pr({
        state: "open",
        mergedAt: merged,
        timeline: [
          { eventType: "created", occurredAt: new Date("2026-11-20T12:00:00.000Z"), sourceDeliveryId: "delivery-1" },
          { eventType: "merged", occurredAt: merged, sourceDeliveryId: "delivery-2" },
          { eventType: "reopened", occurredAt: reopened, sourceDeliveryId: "delivery-3" },
        ],
      })],
      issues: [],
    });
    expect(result.incompleteHistory).toHaveLength(0);
  });

  it("does not treat a deleted branch as a mergeable or reviewable state", () => {
    const result = engine.calculate({
      calculatedAt: now,
      pullRequests: [pr({
        branchDeleted: true,
        updatedAt: new Date("2026-10-20T12:00:00.000Z"),
      })],
      issues: [],
    });
    const activityFinding = result.findings.find((finding) => finding.findingType === "PR_NO_ACTIVITY");
    expect(activityFinding?.evidence.branchDeleted).toBe(true);
  });

  it("deduplicates repeated lifecycle events", () => {
    const duplicateEvent = {
      eventType: "created" as const,
      occurredAt: new Date("2026-11-20T12:00:00.000Z"),
      sourceDeliveryId: "delivery-1",
    };
    const result = engine.calculate({
      calculatedAt: now,
      pullRequests: [pr({ timeline: [duplicateEvent, duplicateEvent] })],
      issues: [],
    });
    expect(result.metrics.timeToFirstReview).toBeNull();
  });

  it("reports issue aging and inactive issue findings from verified timestamps", () => {
    const issue: IssueInput = {
      repositoryId: "repo-1",
      repositoryName: "acme/service",
      number: 7,
      title: "Old issue",
      state: "open",
      createdAt: new Date("2026-08-20T12:00:00.000Z"),
      updatedAt: new Date("2026-10-20T12:00:00.000Z"),
      closedAt: null,
      timeline: [
        { eventType: "issue_created", occurredAt: new Date("2026-08-20T12:00:00.000Z"), sourceDeliveryId: "delivery-4" },
      ],
      historyComplete: true,
    };
    const result = engine.calculate({
      calculatedAt: now,
      pullRequests: [],
      issues: [issue],
    });
    expect(result.findings.some((finding) => finding.findingType === "ISSUE_AGING")).toBe(true);
    expect(result.findings.some((finding) => finding.findingType === "ISSUE_NO_RECENT_ACTIVITY")).toBe(true);
  });
});
