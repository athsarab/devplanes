CREATE TYPE "public"."PlanKey" AS ENUM ('FREE', 'PRO', 'TEAM');
CREATE TYPE "public"."SubscriptionStatus" AS ENUM ('INCOMPLETE', 'INCOMPLETE_EXPIRED', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID', 'PAUSED');
CREATE TYPE "public"."BillingProvider" AS ENUM ('STRIPE');
CREATE TYPE "public"."BillingEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');

CREATE TABLE "public"."Subscription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" "public"."BillingProvider" NOT NULL DEFAULT 'STRIPE',
    "providerCustomerId" TEXT,
    "providerSubscriptionId" TEXT,
    "plan" "public"."PlanKey" NOT NULL DEFAULT 'FREE',
    "status" "public"."SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "gracePeriodEndsAt" TIMESTAMP(3),
    "lastPaymentFailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."EntitlementOverride" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "limitValue" INTEGER,
    "enabled" BOOLEAN,
    "reason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EntitlementOverride_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."BillingEvent" (
    "id" TEXT NOT NULL,
    "provider" "public"."BillingProvider" NOT NULL DEFAULT 'STRIPE',
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" "public"."BillingEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "payload" JSONB NOT NULL,
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    CONSTRAINT "BillingEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."InvoiceSnapshot" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "providerInvoiceId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amountDue" INTEGER NOT NULL,
    "amountPaid" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "hostedInvoiceUrl" TEXT,
    "paymentIntentStatus" TEXT,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "createdAtProvider" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InvoiceSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Subscription_organizationId_key" ON "public"."Subscription"("organizationId");
CREATE UNIQUE INDEX "Subscription_providerSubscriptionId_key" ON "public"."Subscription"("providerSubscriptionId");
CREATE INDEX "Subscription_providerCustomerId_idx" ON "public"."Subscription"("providerCustomerId");
CREATE INDEX "Subscription_status_currentPeriodEnd_idx" ON "public"."Subscription"("status", "currentPeriodEnd");

CREATE INDEX "EntitlementOverride_organizationId_feature_idx" ON "public"."EntitlementOverride"("organizationId", "feature");
CREATE INDEX "EntitlementOverride_expiresAt_idx" ON "public"."EntitlementOverride"("expiresAt");

CREATE UNIQUE INDEX "BillingEvent_providerEventId_key" ON "public"."BillingEvent"("providerEventId");
CREATE INDEX "BillingEvent_status_receivedAt_idx" ON "public"."BillingEvent"("status", "receivedAt");
CREATE INDEX "BillingEvent_eventType_receivedAt_idx" ON "public"."BillingEvent"("eventType", "receivedAt");

CREATE UNIQUE INDEX "InvoiceSnapshot_providerInvoiceId_key" ON "public"."InvoiceSnapshot"("providerInvoiceId");
CREATE INDEX "InvoiceSnapshot_subscriptionId_paid_idx" ON "public"."InvoiceSnapshot"("subscriptionId", "paid");

ALTER TABLE "public"."Subscription" ADD CONSTRAINT "Subscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."EntitlementOverride" ADD CONSTRAINT "EntitlementOverride_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."InvoiceSnapshot" ADD CONSTRAINT "InvoiceSnapshot_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "public"."Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
