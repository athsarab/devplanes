export type CheckoutPlan = "PRO" | "TEAM";

export type CheckoutResult = {
  url: string;
  providerSessionId: string;
};

export const BILLING_PROVIDER = Symbol("BILLING_PROVIDER");

export interface BillingProviderPort {
  createCheckout(params: {
    organizationId: string;
    organizationName: string;
    customerEmail: string;
    plan: CheckoutPlan;
    successUrl: string;
    cancelUrl: string;
  }): Promise<CheckoutResult>;
  createPortal(params: {
    customerId: string;
    returnUrl: string;
  }): Promise<{ url: string }>;
  verifyWebhook(rawBody: Buffer, signature: string | undefined): Promise<{
    eventId: string;
    eventType: string;
    data: unknown;
  }>;
}
