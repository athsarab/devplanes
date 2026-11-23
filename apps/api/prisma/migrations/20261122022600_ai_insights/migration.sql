CREATE TABLE "public"."AIInsightRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "reportingStart" TIMESTAMP(3) NOT NULL,
    "reportingEnd" TIMESTAMP(3) NOT NULL,
    "contextHash" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "output" JSONB NOT NULL,
    "evidenceIds" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIInsightRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AIInsightRecord_organizationId_repositoryId_contextHash_key"
ON "public"."AIInsightRecord"("organizationId", "repositoryId", "contextHash");
CREATE INDEX "AIInsightRecord_organizationId_repositoryId_generatedAt_idx"
ON "public"."AIInsightRecord"("organizationId", "repositoryId", "generatedAt");

ALTER TABLE "public"."AIInsightRecord"
ADD CONSTRAINT "AIInsightRecord_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."AIInsightRecord"
ADD CONSTRAINT "AIInsightRecord_repositoryId_fkey"
FOREIGN KEY ("repositoryId") REFERENCES "public"."ConnectedRepository"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
