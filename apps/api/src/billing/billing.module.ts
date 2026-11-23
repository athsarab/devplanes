import { Module } from "@nestjs/common";
import { BILLING_PROVIDER } from "./billing.provider";
import { BillingService } from "./billing.service";
import { StripeBillingProvider } from "./stripe-billing.provider";
import { BillingController } from "./billing.controller";

@Module({
  providers: [
    StripeBillingProvider,
    {
      provide: BILLING_PROVIDER,
      useExisting: StripeBillingProvider,
    },
    BillingService,
  ],
  controllers: [BillingController],
  exports: [BillingService],
})
export class BillingModule {}
