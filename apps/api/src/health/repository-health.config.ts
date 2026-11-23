export type HealthDimension =
  | "repositoryInactivity"
  | "issueManagement"
  | "pullRequestReview"
  | "outstandingPullRequests"
  | "developmentActivity";

export type RepositoryHealthConfig = {
  weights: Record<HealthDimension, number>;
  thresholds: {
    inactivity: { recentDays: number; watchDays: number; criticalDays: number };
    issues: { oldDays: number; inactiveDays: number };
    pullRequests: { staleDays: number; reviewDelayDays: number };
  };
  categoryBoundaries: {
    excellent: number;
    good: number;
    needsAttention: number;
  };
  minimumHistoryDays: number;
};

export const REPOSITORY_HEALTH_CONFIG: RepositoryHealthConfig = {
  weights: {
    repositoryInactivity: 20,
    issueManagement: 20,
    pullRequestReview: 25,
    outstandingPullRequests: 15,
    developmentActivity: 20,
  },
  thresholds: {
    inactivity: { recentDays: 14, watchDays: 30, criticalDays: 60 },
    issues: { oldDays: 60, inactiveDays: 14 },
    pullRequests: { staleDays: 30, reviewDelayDays: 3 },
  },
  categoryBoundaries: {
    excellent: 90,
    good: 75,
    needsAttention: 50,
  },
  minimumHistoryDays: 14,
};

export function validateHealthConfig(config: RepositoryHealthConfig) {
  const total = Object.values(config.weights).reduce((sum, value) => sum + value, 0);
  if (total !== 100) {
    throw new Error(`Repository health weights must total 100; received ${total}`);
  }
  for (const weight of Object.values(config.weights)) {
    if (!Number.isFinite(weight) || weight < 0) {
      throw new Error("Repository health weights must be finite, non-negative values");
    }
  }
  if (config.categoryBoundaries.excellent < config.categoryBoundaries.good ||
      config.categoryBoundaries.good < config.categoryBoundaries.needsAttention) {
    throw new Error("Repository health category boundaries must descend");
  }
}

validateHealthConfig(REPOSITORY_HEALTH_CONFIG);
