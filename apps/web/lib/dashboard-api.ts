import { ensureDemoSession } from "@/lib/devscope-auth";

export type Point = { date: string; value: number };
export type Repository = {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  visibility: string;
  defaultBranch: string | null;
  primaryLanguage: string | null;
  isArchived?: boolean;
  disconnectedAt?: string | null;
  updatedAt?: string;
};
export type IssueItem = {
  repositoryId: string;
  repository: string;
  number: number;
  title: string;
  state: string;
  author: string | null;
  labels: Array<string | null>;
  createdAt: string | null;
  updatedAt: string | null;
  closedAt: string | null;
  url: string | null;
  assignees: number;
};
export type PullRequestItem = {
  repositoryId: string;
  repository: string;
  number: number;
  title: string;
  state: string;
  author: string | null;
  draft: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  closedAt: string | null;
  mergedAt: string | null;
  url: string | null;
};
export type Analytics = {
  dateRange: { start: string; end: string };
  overview: {
    connectedRepositories: number;
    totalCommits: number;
    openIssues: number;
    closedIssues: number;
    openPullRequests: number;
  };
  commits: {
    daily: Point[];
    weekly: Point[];
    monthly: Point[];
    repositoryComparison: Array<{ repositoryId: string; name: string; commits: number; openIssues: number; openPullRequests: number }>;
    contributors: Array<{ name: string; commits: number }>;
  };
  issues: { open: number; closed: number; created: Point[]; resolved: Point[]; unassigned: number; items: IssueItem[] };
  pullRequests: { open: number; merged: number; closed: number; averageDaysToMerge: number | null; stale: number; items: PullRequestItem[] };
  repositoryHealth: Array<{
    id: string; name: string; owner: string; description: string | null; visibility: string;
    defaultBranch: string | null; primaryLanguage: string | null; unresolvedIssues: number;
    pendingPullRequests: number; lastUpdated: string | null;
  }>;
  inaccessible: Array<{ repositoryId: string; fullName: string; reason: string }>;
};
export type Intelligence = {
  repositories: Array<{
    id: string;
    name: string;
    health: null | {
      status: "HEALTHY" | "WATCH" | "AT_RISK" | "UNKNOWN";
      score: number;
      unresolvedIssues: number;
      stalePullRequests: number;
      inactiveIssues: number;
      pushes30d: number;
      activityTrend: string;
      explanations: unknown[];
      computedAt: string;
    };
  }>;
  recentEvents: Array<{
    id: string; repository: string; eventType: string; action: string | null; title: string;
    description: string | null; githubId: string | null; occurredAt: string;
  }>;
};
export type HealthSummary = {
  calculatedAt: string;
  repositories: Array<{
    repositoryId: string;
    repositoryName: string;
    isArchived: boolean;
    overallScore: number;
    category: "Excellent" | "Good" | "Needs Attention" | "Critical";
    dataCompleteness: {
      status: "complete" | "partial" | "insufficient";
      availableDimensions: number;
      totalDimensions: number;
      unavailableDimensions: string[];
    };
    calculatedAt: string;
  }>;
};
export type Installation = {
  id: string;
  installationId: string;
  accountLogin: string;
  accountType: string;
  status: string;
  repositorySelection: string;
  repositories: Repository[];
};

export type BottleneckFinding = {
  findingType: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  repositoryId: string;
  repositoryReference: string;
  referenceType: "pull_request" | "issue" | "repository";
  referenceNumber: number | null;
  evidence: Record<string, unknown>;
  detectedAt: string;
  active: boolean;
  suggestedAction: string;
};

export type BottleneckOverview = {
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
  findings: BottleneckFinding[];
  incompleteHistory: Array<{
    repositoryId: string;
    referenceType: "pull_request" | "issue";
    referenceNumber: number;
    reason: string;
  }>;
};

export type AIInsightResult = {
  repositoryId: string;
  repositoryName: string;
  generatedAt: string;
  provider: string;
  model: string;
  cached: boolean;
  evidenceIds: string[];
  output: {
    summary: string;
    keyObservations: Array<{ text: string; evidenceIds: string[] }>;
    supportingEvidenceReferences: string[];
    potentialRisks: Array<{ text: string; evidenceIds: string[] }>;
    recommendedActions: Array<{ text: string; evidenceIds: string[] }>;
    confidenceOrDataCompleteness: string;
  };
};

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const { token, workspaceId } = await ensureDemoSession();
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "X-DevScope-Workspace-ID": workspaceId,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(body?.message ?? `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  const content = await response.text();
  return content ? JSON.parse(content) as T : undefined as T;
}

export async function loadAnalytics(options: { days?: number; category?: string; repositoryId?: string } = {}) {
  const days = options.days ?? 30;
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const params = new URLSearchParams({
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    category: options.category ?? "all",
  });
  if (options.repositoryId) params.set("repositoryId", options.repositoryId);
  return apiRequest<Analytics>(`/github/analytics?${params.toString()}`);
}

export function formatDate(value: string | null | undefined, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, options).format(date);
}

export function relativeTime(value: string | null | undefined) {
  if (!value) return "No recent activity";
  const elapsed = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(elapsed)) return "—";
  const days = Math.floor(elapsed / 86_400_000);
  if (days < 1) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return formatDate(value, { month: "short", day: "numeric", year: "numeric" });
}
