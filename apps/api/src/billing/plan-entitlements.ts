export type PlanKey = "FREE" | "PRO" | "TEAM";

export type Entitlements = {
  plan: PlanKey;
  name: string;
  repositoryLimit: number;
  memberLimit: number;
  basicAnalytics: boolean;
  advancedAnalytics: boolean;
  repositoryHealth: boolean;
  weeklySummaries: boolean;
  historicalDays: number;
  sharedDashboards: boolean;
  teamAnalytics: boolean;
};

export const PLAN_ENTITLEMENTS: Record<PlanKey, Entitlements> = {
  FREE: {
    plan: "FREE",
    name: "Free",
    repositoryLimit: 3,
    memberLimit: 1,
    basicAnalytics: true,
    advancedAnalytics: false,
    repositoryHealth: false,
    weeklySummaries: false,
    historicalDays: 30,
    sharedDashboards: false,
    teamAnalytics: false,
  },
  PRO: {
    plan: "PRO",
    name: "Pro",
    repositoryLimit: 25,
    memberLimit: 1,
    basicAnalytics: true,
    advancedAnalytics: true,
    repositoryHealth: true,
    weeklySummaries: true,
    historicalDays: 365,
    sharedDashboards: false,
    teamAnalytics: false,
  },
  TEAM: {
    plan: "TEAM",
    name: "Team",
    repositoryLimit: 100,
    memberLimit: 25,
    basicAnalytics: true,
    advancedAnalytics: true,
    repositoryHealth: true,
    weeklySummaries: true,
    historicalDays: 730,
    sharedDashboards: true,
    teamAnalytics: true,
  },
};
