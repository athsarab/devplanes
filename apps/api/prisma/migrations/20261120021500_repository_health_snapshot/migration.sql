CREATE TABLE "public"."RepositoryHealthSnapshot" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "dimensions" JSONB NOT NULL,
    "positiveFactors" JSONB NOT NULL,
    "negativeFactors" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "recommendations" JSONB NOT NULL,
    "dataCompleteness" JSONB NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RepositoryHealthSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RepositoryHealthSnapshot_repositoryId_calculatedAt_idx"
ON "public"."RepositoryHealthSnapshot"("repositoryId", "calculatedAt");
CREATE INDEX "RepositoryHealthSnapshot_category_calculatedAt_idx"
ON "public"."RepositoryHealthSnapshot"("category", "calculatedAt");

ALTER TABLE "public"."RepositoryHealthSnapshot"
ADD CONSTRAINT "RepositoryHealthSnapshot_repositoryId_fkey"
FOREIGN KEY ("repositoryId") REFERENCES "public"."ConnectedRepository"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
