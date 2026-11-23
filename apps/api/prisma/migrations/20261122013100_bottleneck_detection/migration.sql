CREATE TABLE "public"."PullRequestLifecycleEvent" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "pullRequestNumber" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "sourceDeliveryId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "historyComplete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PullRequestLifecycleEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."IssueLifecycleEvent" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "issueNumber" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "sourceDeliveryId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "historyComplete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IssueLifecycleEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."DevelopmentBottleneckFinding" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "findingType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceNumber" INTEGER,
    "findingKey" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "suggestedAction" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DevelopmentBottleneckFinding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PullRequestLifecycleEvent_eventKey_key" ON "public"."PullRequestLifecycleEvent"("eventKey");
CREATE INDEX "PullRequestLifecycleEvent_repositoryId_pullRequestNumber_occurredAt_idx" ON "public"."PullRequestLifecycleEvent"("repositoryId", "pullRequestNumber", "occurredAt");
CREATE INDEX "PullRequestLifecycleEvent_eventType_occurredAt_idx" ON "public"."PullRequestLifecycleEvent"("eventType", "occurredAt");
CREATE UNIQUE INDEX "IssueLifecycleEvent_eventKey_key" ON "public"."IssueLifecycleEvent"("eventKey");
CREATE INDEX "IssueLifecycleEvent_repositoryId_issueNumber_occurredAt_idx" ON "public"."IssueLifecycleEvent"("repositoryId", "issueNumber", "occurredAt");
CREATE INDEX "IssueLifecycleEvent_eventType_occurredAt_idx" ON "public"."IssueLifecycleEvent"("eventType", "occurredAt");
CREATE UNIQUE INDEX "DevelopmentBottleneckFinding_findingKey_key" ON "public"."DevelopmentBottleneckFinding"("findingKey");
CREATE INDEX "DevelopmentBottleneckFinding_repositoryId_active_detectedAt_idx" ON "public"."DevelopmentBottleneckFinding"("repositoryId", "active", "detectedAt");
CREATE INDEX "DevelopmentBottleneckFinding_severity_active_idx" ON "public"."DevelopmentBottleneckFinding"("severity", "active");
CREATE INDEX "DevelopmentBottleneckFinding_findingType_detectedAt_idx" ON "public"."DevelopmentBottleneckFinding"("findingType", "detectedAt");

ALTER TABLE "public"."PullRequestLifecycleEvent" ADD CONSTRAINT "PullRequestLifecycleEvent_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "public"."ConnectedRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."IssueLifecycleEvent" ADD CONSTRAINT "IssueLifecycleEvent_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "public"."ConnectedRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."DevelopmentBottleneckFinding" ADD CONSTRAINT "DevelopmentBottleneckFinding_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "public"."ConnectedRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
