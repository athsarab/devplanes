import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";
import {
  BillingProviderPort,
  CheckoutPlan,
  CheckoutResult,
} from "./billing.provider";

@Injectable()
export class StripeBillingProvider implements BillingProviderPort {
  private readonly stripe: Stripe | null;
  private readonly webhookSecret: string | null;
  private readonly config: ConfigService;

  constructor(config: ConfigService) {
    this.config = config;
    const secretKey = config.get<string>("STRIPE_SECRET_KEY");
    this.webhookSecret = config.get<string>("STRIPE_WEBHOOK_SECRET") ?? null;
    this.stripe = secretKey ? new Stripe(secretKey) : null;
  }

  private requireStripe(): Stripe {
    if (!this.stripe) {
      throw new InternalServerErrorException("Billing provider is not configured");
    }
    return this.stripe;
  }

  async createCheckout(params: {
    organizationId: string;
    organizationName: string;
    customerEmail: string;
    plan: CheckoutPlan;
    successUrl: string;
    cancelUrl: string;
  }): Promise<CheckoutResult> {
    const stripe = this.requireStripe();
    const priceId = params.plan === "PRO"
      ? this.config.get<string>("STRIPE_PRO_PRICE_ID")
      : this.config.get<string>("STRIPE_TEAM_PRICE_ID");
    if (!priceId) {
      throw new InternalServerErrorException(`Stripe price is not configured for ${params.plan}`);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: params.customerEmail,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: {
        devscopeOrganizationId: params.organizationId,
        devscopePlan: params.plan,
      },
      subscription_data: {
        metadata: {
          devscopeOrganizationId: params.organizationId,
          devscopePlan: params.plan,
        },
      },
    });
    if (!session.url) {
      throw new InternalServerErrorException("Billing provider did not return a checkout URL");
    }
    return { url: session.url, providerSessionId: session.id };
  }

  async createPortal(params: {
    customerId: string;
    returnUrl: string;
  }): Promise<{ url: string }> {
    const session = await this.requireStripe().billingPortal.sessions.create({
      customer: params.customerId,
      return_url: params.returnUrl,
    });
    return { url: session.url };
  }

  async verifyWebhook(rawBody: Buffer, signature: string | undefined) {
    if (!signature || !this.webhookSecret) {
      throw new UnauthorizedException("Invalid billing webhook signature");
    }
    let event: Stripe.Event;
    try {
      event = this.requireStripe().webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret,
      );
    } catch {
      throw new UnauthorizedException("Invalid billing webhook signature");
    }
    return {
      eventId: event.id,
      eventType: event.type,
      data: event.data.object,
    };
  }
}
