import {
  Inject,
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  BillingProviderPort,
  CheckoutPlan,
  BILLING_PROVIDER,
} from "./billing.provider";
import { PLAN_ENTITLEMENTS, Entitlements, PlanKey } from "./plan-entitlements";

type SessionContext = {
  userId: string;
  organizationId: string;
};

type SubscriptionData = {
  id?: string;
  customer?: string | { id?: string };
  status?: string;
  cancel_at_period_end?: boolean;
  cancel_at?: number | null;
  canceled_at?: number | null;
  current_period_start?: number;
  current_period_end?: number;
  trial_end?: number | null;
  metadata?: Record<string, string>;
};

type CheckoutData = {
  id?: string;
  customer?: string | { id?: string };
  subscription?: string | { id?: string };
  metadata?: Record<string, string>;
};

type InvoiceData = {
  id?: string;
  customer?: string | { id?: string };
  subscription?: string | { id?: string };
  status?: string;
  amount_due?: number;
  amount_paid?: number;
  currency?: string;
  hosted_invoice_url?: string | null;
  period_start?: number;
  period_end?: number;
  created?: number;
  payment_intent?: string | { status?: string } | null;
};

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(BILLING_PROVIDER)
    private readonly provider: BillingProviderPort,
  ) {}

  async getStatus(context: SessionContext) {
    await this.requireBillingRole(context);
    const subscription = await this.ensureFreeSubscription(context.organizationId);
    const effective = await this.getEffectiveEntitlements(context.organizationId);
    return {
      plan: effective.plan,
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      gracePeriodEndsAt: subscription.gracePeriodEndsAt,
      entitlements: effective,
      provider: subscription.provider,
      hasCustomerRecord: Boolean(subscription.providerCustomerId),
    };
  }

  async startCheckout(context: SessionContext, plan: string) {
    await this.requireBillingRole(context);
    if (plan !== "PRO" && plan !== "TEAM") {
      throw new BadRequestException("Only PRO or TEAM plans can be purchased");
    }
    const organization = await this.prisma.organization.findUnique({
      where: { id: context.organizationId },
      include: { memberships: { where: { userId: context.userId }, include: { user: true } } },
    });
    if (!organization) throw new NotFoundException("Workspace was not found");

    const email = organization.memberships[0]?.user.email;
    if (!email) throw new BadRequestException("Workspace owner email is unavailable");

    const result = await this.provider.createCheckout({
      organizationId: organization.id,
      organizationName: organization.name,
      customerEmail: email,
      plan: plan as CheckoutPlan,
      successUrl: this.config.get<string>("STRIPE_SUCCESS_URL") ??
        "http://localhost:3000/dashboard/settings/billing?checkout=processing",
      cancelUrl: this.config.get<string>("STRIPE_CANCEL_URL") ??
        "http://localhost:3000/dashboard/settings/billing?checkout=canceled",
    });
    return result;
  }

  async createPortal(context: SessionContext) {
    await this.requireBillingRole(context);
    const subscription = await this.ensureFreeSubscription(context.organizationId);
    if (!subscription.providerCustomerId) {
      throw new BadRequestException("No billing customer is configured");
    }
    return this.provider.createPortal({
      customerId: subscription.providerCustomerId,
      returnUrl: this.config.get<string>("STRIPE_PORTAL_RETURN_URL") ??
        "http://localhost:3000/dashboard/settings/billing",
    });
  }

  async processWebhook(rawBody: Buffer, signature: string | undefined) {
    const event = await this.provider.verifyWebhook(rawBody, signature);
    const existing = await this.prisma.billingEvent.findUnique({
      where: { providerEventId: event.eventId },
    });
    if (existing?.status === "PROCESSED") {
      return { received: true, duplicate: true };
    }

    const billingEvent = existing ?? await this.prisma.billingEvent.create({
      data: {
        provider: "STRIPE",
        providerEventId: event.eventId,
        eventType: event.eventType,
        status: "RECEIVED",
        payload: JSON.parse(JSON.stringify(event.data)) as Prisma.JsonObject,
      },
    });

    try {
      await this.processProviderEvent(event.eventType, event.data);
      await this.prisma.billingEvent.update({
        where: { id: billingEvent.id },
        data: { status: "PROCESSED", processedAt: new Date(), error: null },
      });
      return { received: true, duplicate: false };
    } catch (error) {
      const message = this.safeError(error);
      await this.prisma.billingEvent.update({
        where: { id: billingEvent.id },
        data: { status: "FAILED", error: message },
      });
      throw error;
    }
  }

  async getEffectiveEntitlements(organizationId: string): Promise<Entitlements> {
    const subscription = await this.ensureFreeSubscription(organizationId);
    let plan: PlanKey = "FREE";

    const now = new Date();
    if (
      (subscription.status === "ACTIVE" ||
        subscription.status === "TRIALING" ||
        subscription.status === "PAST_DUE") &&
      !(subscription.status === "PAST_DUE" &&
        subscription.gracePeriodEndsAt &&
        subscription.gracePeriodEndsAt < now)
    ) {
      plan = subscription.plan;
    } else if (
      subscription.status === "CANCELED" &&
      subscription.currentPeriodEnd &&
      subscription.currentPeriodEnd > now
    ) {
      plan = subscription.plan;
    }

    const effective = {
      ...PLAN_ENTITLEMENTS[plan],
    };
    const overrides = await this.prisma.entitlementOverride.findMany({
      where: {
        organizationId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });
    for (const override of overrides) {
      if (override.feature === "repositoryLimit" && override.limitValue !== null) {
        effective.repositoryLimit = override.limitValue;
      }
      if (override.feature === "memberLimit" && override.limitValue !== null) {
        effective.memberLimit = override.limitValue;
      }
      if (override.feature === "advancedAnalytics" && override.enabled !== null) {
        effective.advancedAnalytics = override.enabled;
      }
      if (override.feature === "repositoryHealth" && override.enabled !== null) {
        effective.repositoryHealth = override.enabled;
      }
      if (override.feature === "weeklySummaries" && override.enabled !== null) {
        effective.weeklySummaries = override.enabled;
      }
      if (override.feature === "sharedDashboards" && override.enabled !== null) {
        effective.sharedDashboards = override.enabled;
      }
      if (override.feature === "teamAnalytics" && override.enabled !== null) {
        effective.teamAnalytics = override.enabled;
      }
    }
    return effective;
  }

  async enforceRepositoryLimit(organizationId: string) {
    const entitlements = await this.getEffectiveEntitlements(organizationId);
    const count = await this.prisma.connectedRepository.count({
      where: {
        disconnectedAt: null,
        installation: {
          organizationId,
          status: "ACTIVE",
        },
      },
    });
    if (count >= entitlements.repositoryLimit) {
      throw new ForbiddenException(
        `This workspace has reached the ${entitlements.name} plan repository limit of ${entitlements.repositoryLimit}.`,
      );
    }
  }

  async enforceMemberLimit(organizationId: string) {
    const entitlements = await this.getEffectiveEntitlements(organizationId);
    const count = await this.prisma.membership.count({
      where: { organizationId },
    });
    if (count >= entitlements.memberLimit) {
      throw new ForbiddenException(
        `This workspace has reached the ${entitlements.name} plan member limit of ${entitlements.memberLimit}.`,
      );
    }
  }

  async requireFeature(organizationId: string, feature: keyof Entitlements) {
    const entitlements = await this.getEffectiveEntitlements(organizationId);
    const allowed = entitlements[feature];
    if (allowed === false || allowed === 0) {
      throw new ForbiddenException(
        `This feature is not included in the ${entitlements.name} plan.`,
      );
    }
  }

  private async processProviderEvent(eventType: string, data: unknown) {
    if (eventType === "checkout.session.completed") {
      const checkout = data as CheckoutData;
      await this.processCheckoutCompleted(checkout);
      return;
    }
    if (
      eventType === "customer.subscription.created" ||
      eventType === "customer.subscription.updated" ||
      eventType === "customer.subscription.deleted"
    ) {
      await this.processSubscription(data as SubscriptionData);
      return;
    }
    if (
      eventType === "invoice.paid" ||
      eventType === "invoice.payment_failed" ||
      eventType === "invoice.finalized"
    ) {
      await this.processInvoice(data as InvoiceData);
    }
  }

  private async processCheckoutCompleted(checkout: CheckoutData) {
    const organizationId = checkout.metadata?.devscopeOrganizationId;
    const plan = this.planFromMetadata(checkout.metadata?.devscopePlan);
    if (!organizationId || !plan) return;

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!organization) return;

    const customerId = typeof checkout.customer === "string"
      ? checkout.customer
      : checkout.customer?.id;
    await this.prisma.subscription.upsert({
      where: { organizationId },
      create: {
        organizationId,
        provider: "STRIPE",
        providerCustomerId: customerId ?? null,
        providerSubscriptionId:
          typeof checkout.subscription === "string"
            ? checkout.subscription
            : checkout.subscription?.id ?? null,
        plan,
        status: "INCOMPLETE",
      },
      update: {
        providerCustomerId: customerId ?? null,
        providerSubscriptionId:
          typeof checkout.subscription === "string"
            ? checkout.subscription
            : checkout.subscription?.id ?? null,
        plan,
      },
    });
  }

  private async processSubscription(subscription: SubscriptionData) {
    const providerSubscriptionId = subscription.id;
    if (!providerSubscriptionId) return;

    let record = await this.prisma.subscription.findUnique({
      where: { providerSubscriptionId },
    });
    if (!record) {
      const organizationId = subscription.metadata?.devscopeOrganizationId;
      if (!organizationId) return;
      record = await this.prisma.subscription.findUnique({
        where: { organizationId },
      });
      if (!record) {
        record = await this.prisma.subscription.create({
          data: {
            organizationId,
            provider: "STRIPE",
            providerSubscriptionId,
            providerCustomerId:
              typeof subscription.customer === "string"
                ? subscription.customer
                : subscription.customer?.id ?? null,
            plan: this.planFromMetadata(subscription.metadata?.devscopePlan) ?? "FREE",
            status: "INCOMPLETE",
          },
        });
      }
    }

    const plan = this.planFromMetadata(subscription.metadata?.devscopePlan) ?? record.plan;
    const status = this.mapSubscriptionStatus(subscription.status);
    const now = new Date();
    await this.prisma.subscription.update({
      where: { id: record.id },
      data: {
        providerSubscriptionId,
        providerCustomerId:
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer?.id ?? record.providerCustomerId,
        plan,
        status,
        cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
        currentPeriodStart: subscription.current_period_start
          ? new Date(subscription.current_period_start * 1000)
          : record.currentPeriodStart,
        currentPeriodEnd: subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000)
          : record.currentPeriodEnd,
        gracePeriodEndsAt:
          status === "PAST_DUE"
            ? new Date(now.getTime() + 7 * 86_400_000)
            : status === "UNPAID" || status === "CANCELED"
              ? now
              : null,
        lastPaymentFailedAt:
          status === "PAST_DUE" ? now : record.lastPaymentFailedAt,
      },
    });
  }

  private async processInvoice(invoice: InvoiceData) {
    const providerInvoiceId = invoice.id;
    const providerSubscriptionId =
      typeof invoice.subscription === "string"
        ? invoice.subscription
        : invoice.subscription?.id;
    if (!providerInvoiceId || !providerSubscriptionId) return;

    const subscription = await this.prisma.subscription.findUnique({
      where: { providerSubscriptionId },
    });
    if (!subscription) return;

    const paid = invoice.status === "paid";
    await this.prisma.invoiceSnapshot.upsert({
      where: { providerInvoiceId },
      create: {
        subscriptionId: subscription.id,
        providerInvoiceId,
        status: invoice.status ?? "unknown",
        amountDue: invoice.amount_due ?? 0,
        amountPaid: invoice.amount_paid ?? 0,
        currency: (invoice.currency ?? "usd").toLowerCase(),
        paid,
        hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
        paymentIntentStatus:
          typeof invoice.payment_intent === "object"
            ? invoice.payment_intent?.status ?? null
            : null,
        periodStart: invoice.period_start
          ? new Date(invoice.period_start * 1000)
          : null,
        periodEnd: invoice.period_end
          ? new Date(invoice.period_end * 1000)
          : null,
        createdAtProvider: invoice.created
          ? new Date(invoice.created * 1000)
          : null,
      },
      update: {
        status: invoice.status ?? "unknown",
        amountDue: invoice.amount_due ?? 0,
        amountPaid: invoice.amount_paid ?? 0,
        currency: (invoice.currency ?? "usd").toLowerCase(),
        paid,
        hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
        paymentIntentStatus:
          typeof invoice.payment_intent === "object"
            ? invoice.payment_intent?.status ?? null
            : null,
      },
    });
  }

  private async ensureFreeSubscription(organizationId: string) {
    return this.prisma.subscription.upsert({
      where: { organizationId },
      create: {
        organizationId,
        provider: "STRIPE",
        plan: "FREE",
        status: "ACTIVE",
      },
      update: {},
    });
  }

  private async requireBillingRole(context: SessionContext) {
    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: context.userId,
          organizationId: context.organizationId,
        },
      },
    });
    if (!membership || (membership.role !== "OWNER" && membership.role !== "ADMIN")) {
      throw new ForbiddenException("Workspace owner or admin access is required");
    }
  }

  private planFromMetadata(value: string | undefined): "PRO" | "TEAM" | null {
    if (value === "PRO" || value === "TEAM") return value;
    return null;
  }

  private mapSubscriptionStatus(status: string | undefined) {
    switch (status) {
      case "trialing":
        return "TRIALING" as const;
      case "active":
        return "ACTIVE" as const;
      case "past_due":
        return "PAST_DUE" as const;
      case "canceled":
        return "CANCELED" as const;
      case "unpaid":
        return "UNPAID" as const;
      case "paused":
        return "PAUSED" as const;
      case "incomplete_expired":
        return "INCOMPLETE_EXPIRED" as const;
      default:
        return "INCOMPLETE" as const;
    }
  }

  private safeError(error: unknown): string {
    if (typeof error === "object" && error) {
      const status = Number((error as { status?: number }).status);
      if (status >= 500) return "Billing provider temporary failure";
      if (status === 401 || status === 403) return "Billing provider authorization failure";
    }
    return "Billing event processing failed";
  }
}
