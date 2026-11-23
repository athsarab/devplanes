import {
  RepositoryHealthEngine,
  RepositoryHealthInput,
} from "./repository-health.engine";
import { REPOSITORY_HEALTH_CONFIG, validateHealthConfig } from "./repository-health.config";

function input(overrides: Partial<RepositoryHealthInput> = {}): RepositoryHealthInput {
  return {
    calculatedAt: new Date("2026-01-31T12:00:00.000Z"),
    archived: false,
    metadataAvailable: true,
    lastCommitAt: new Date("2026-01-30T12:00:00.000Z"),
    lastActivityAt: new Date("2026-01-30T12:00:00.000Z"),
    commitsCurrentPeriod: 20,
    commitsPreviousPeriod: 18,
    openIssues: 2,
    oldIssues: 0,
    unassignedIssues: 0,
    inactiveIssues: 0,
    resolvedIssuesCurrentPeriod: 4,
    resolvedIssuesPreviousPeriod: 3,
    openPullRequests: 1,
    stalePullRequests: 0,
    waitingForReviewPullRequests: 0,
    waitingForChangesPullRequests: 0,
    mergedPullRequestsCurrentPeriod: 3,
    mergedPullRequestsPreviousPeriod: 2,
    reviewTurnaroundDays: 1,
    ...overrides,
  };
}

describe("RepositoryHealthEngine", () => {
  const engine = new RepositoryHealthEngine();

  it("validates the configured weights total 100", () => {
    expect(() => validateHealthConfig(REPOSITORY_HEALTH_CONFIG)).not.toThrow();
  });

  it("scores inactivity at 100 for recent activity", () => {
    const result = engine.calculate(input());
    expect(result.dimensions.find((item) => item.key === "repositoryInactivity")?.score).toBe(100);
  });

  it("does not penalize archived repositories for inactivity", () => {
    const result = engine.calculate(input({
      archived: true,
      lastCommitAt: new Date("2025-01-01T00:00:00.000Z"),
      lastActivityAt: new Date("2025-01-01T00:00:00.000Z"),
    }));
    expect(result.dimensions.find((item) => item.key === "repositoryInactivity")?.score).toBe(100);
  });

  it("marks unavailable inactivity data without treating it as zero", () => {
    const result = engine.calculate(input({
      metadataAvailable: false,
      lastCommitAt: null,
      lastActivityAt: null,
    }));
    expect(result.dimensions.find((item) => item.key === "repositoryInactivity")?.score).toBeNull();
    expect(result.dataCompleteness.status).not.toBe("complete");
  });

  it("detects old and unassigned issues", () => {
    const result = engine.calculate(input({
      openIssues: 10,
      oldIssues: 4,
      unassignedIssues: 3,
      inactiveIssues: 5,
    }));
    const issueDimension = result.dimensions.find((item) => item.key === "issueManagement");
    expect(issueDimension?.score).toBeLessThan(50);
    expect(result.negativeFactors.join(" ")).toContain("unassigned");
  });

  it("detects review delays and stale pull requests", () => {
    const result = engine.calculate(input({
      waitingForReviewPullRequests: 4,
      waitingForChangesPullRequests: 2,
      stalePullRequests: 3,
      reviewTurnaroundDays: 8,
    }));
    const reviewDimension = result.dimensions.find((item) => item.key === "pullRequestReview");
    expect(reviewDimension?.score).toBeLessThan(50);
  });

  it("penalizes outstanding pull requests", () => {
    const result = engine.calculate(input({
      openPullRequests: 8,
      stalePullRequests: 4,
    }));
    expect(result.dimensions.find((item) => item.key === "outstandingPullRequests")?.score).toBeLessThan(50);
  });

  it("treats insufficient development history as unavailable", () => {
    const result = engine.calculate(input({
      commitsCurrentPeriod: 0,
      commitsPreviousPeriod: 0,
      mergedPullRequestsCurrentPeriod: 0,
      mergedPullRequestsPreviousPeriod: 0,
      resolvedIssuesCurrentPeriod: 0,
      resolvedIssuesPreviousPeriod: 0,
    }));
    expect(result.dimensions.find((item) => item.key === "developmentActivity")?.score).toBeNull();
  });

  it("returns identical output for identical input", () => {
    const first = engine.calculate(input());
    const second = engine.calculate(input());
    expect(first).toEqual(second);
  });
});
