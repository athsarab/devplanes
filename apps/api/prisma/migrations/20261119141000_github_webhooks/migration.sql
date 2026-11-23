CREATE TYPE "public"."GitHubWebhookStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
CREATE TYPE "public"."RepositoryHealthStatus" AS ENUM ('HEALTHY', 'WATCH', 'AT_RISK', 'UNKNOWN');

CREATE TABLE "public"."GitHubWebhookEvent" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "action" TEXT,
    "installationId" BIGINT,
    "repositoryId" BIGINT,
    "status" "public"."GitHubWebhookStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    CONSTRAINT "GitHubWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."GitHubRecentEvent" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "action" TEXT,
    "deliveryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "githubId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GitHubRecentEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."GitHubIssueSnapshot" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "githubIssueId" BIGINT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "authorLogin" TEXT,
    "assigneeCount" INTEGER NOT NULL DEFAULT 0,
    "labels" JSONB NOT NULL DEFAULT '[]',
    "githubCreatedAt" TIMESTAMP(3) NOT NULL,
    "githubUpdatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GitHubIssueSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."GitHubPullRequestSnapshot" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "githubPullId" BIGINT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "draft" BOOLEAN NOT NULL DEFAULT false,
    "authorLogin" TEXT,
    "mergedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "githubCreatedAt" TIMESTAMP(3) NOT NULL,
    "githubUpdatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GitHubPullRequestSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."GitHubReleaseSnapshot" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "githubReleaseId" BIGINT NOT NULL,
    "tagName" TEXT NOT NULL,
    "name" TEXT,
    "draft" BOOLEAN NOT NULL DEFAULT false,
    "prerelease" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "githubCreatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GitHubReleaseSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."RepositoryHealth" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "status" "public"."RepositoryHealthStatus" NOT NULL DEFAULT 'UNKNOWN',
    "score" INTEGER NOT NULL DEFAULT 0,
    "unresolvedIssues" INTEGER NOT NULL DEFAULT 0,
    "stalePullRequests" INTEGER NOT NULL DEFAULT 0,
    "inactiveIssues" INTEGER NOT NULL DEFAULT 0,
    "pushes30d" INTEGER NOT NULL DEFAULT 0,
    "activityTrend" TEXT NOT NULL DEFAULT 'unknown',
    "indicators" JSONB NOT NULL DEFAULT '[]',
    "explanations" JSONB NOT NULL DEFAULT '[]',
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RepositoryHealth_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GitHubWebhookEvent_deliveryId_key" ON "public"."GitHubWebhookEvent"("deliveryId");
CREATE INDEX "GitHubWebhookEvent_status_nextAttemptAt_idx" ON "public"."GitHubWebhookEvent"("status", "nextAttemptAt");
CREATE INDEX "GitHubWebhookEvent_eventType_receivedAt_idx" ON "public"."GitHubWebhookEvent"("eventType", "receivedAt");
CREATE INDEX "GitHubWebhookEvent_repositoryId_idx" ON "public"."GitHubWebhookEvent"("repositoryId");

CREATE UNIQUE INDEX "GitHubRecentEvent_deliveryId_eventType_key" ON "public"."GitHubRecentEvent"("deliveryId", "eventType");
CREATE INDEX "GitHubRecentEvent_repositoryId_occurredAt_idx" ON "public"."GitHubRecentEvent"("repositoryId", "occurredAt");
CREATE INDEX "GitHubRecentEvent_eventType_occurredAt_idx" ON "public"."GitHubRecentEvent"("eventType", "occurredAt");

CREATE UNIQUE INDEX "GitHubIssueSnapshot_repositoryId_githubIssueId_key" ON "public"."GitHubIssueSnapshot"("repositoryId", "githubIssueId");
CREATE INDEX "GitHubIssueSnapshot_repositoryId_state_idx" ON "public"."GitHubIssueSnapshot"("repositoryId", "state");
CREATE INDEX "GitHubIssueSnapshot_githubUpdatedAt_idx" ON "public"."GitHubIssueSnapshot"("githubUpdatedAt");

CREATE UNIQUE INDEX "GitHubPullRequestSnapshot_repositoryId_githubPullId_key" ON "public"."GitHubPullRequestSnapshot"("repositoryId", "githubPullId");
CREATE INDEX "GitHubPullRequestSnapshot_repositoryId_state_idx" ON "public"."GitHubPullRequestSnapshot"("repositoryId", "state");
CREATE INDEX "GitHubPullRequestSnapshot_githubUpdatedAt_idx" ON "public"."GitHubPullRequestSnapshot"("githubUpdatedAt");

CREATE UNIQUE INDEX "GitHubReleaseSnapshot_repositoryId_githubReleaseId_key" ON "public"."GitHubReleaseSnapshot"("repositoryId", "githubReleaseId");
CREATE INDEX "GitHubReleaseSnapshot_repositoryId_publishedAt_idx" ON "public"."GitHubReleaseSnapshot"("repositoryId", "publishedAt");

CREATE UNIQUE INDEX "RepositoryHealth_repositoryId_key" ON "public"."RepositoryHealth"("repositoryId");
CREATE INDEX "RepositoryHealth_status_score_idx" ON "public"."RepositoryHealth"("status", "score");

ALTER TABLE "public"."GitHubRecentEvent" ADD CONSTRAINT "GitHubRecentEvent_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "public"."ConnectedRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."GitHubIssueSnapshot" ADD CONSTRAINT "GitHubIssueSnapshot_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "public"."ConnectedRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."GitHubPullRequestSnapshot" ADD CONSTRAINT "GitHubPullRequestSnapshot_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "public"."ConnectedRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."GitHubReleaseSnapshot" ADD CONSTRAINT "GitHubReleaseSnapshot_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "public"."ConnectedRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."RepositoryHealth" ADD CONSTRAINT "RepositoryHealth_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "public"."ConnectedRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
