import {
  Controller,
  Get,
  Headers,
  Post,
  Body,
  Req,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import type { Request } from "express";
import { DevScopeSessionGuard } from "../auth/devscope-session.guard";
import { BillingService } from "./billing.service";

type GuardedRequest = Request & {
  devScopeUserId?: string;
  devScopeOrganizationId?: string;
};

@Controller("billing")
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get("subscription")
  @UseGuards(DevScopeSessionGuard)
  async subscription(@Req() request: GuardedRequest) {
    return this.billing.getStatus(this.requireContext(request));
  }

  @Post("checkout")
  @UseGuards(DevScopeSessionGuard)
  async checkout(
    @Req() request: GuardedRequest,
    @Body("plan") plan: unknown,
  ) {
    if (typeof plan !== "string") {
      throw new BadRequestException("A valid plan is required");
    }
    return this.billing.startCheckout(this.requireContext(request), plan);
  }

  @Post("portal")
  @UseGuards(DevScopeSessionGuard)
  async portal(@Req() request: GuardedRequest) {
    return this.billing.createPortal(this.requireContext(request));
  }

  @Post("webhooks")
  async webhook(
    @Req() request: Request & { rawBody?: Buffer },
    @Headers("stripe-signature") signature: string,
  ) {
    return this.billing.processWebhook(
      request.rawBody ?? Buffer.from(""),
      signature,
    );
  }

  private requireContext(request: GuardedRequest) {
    if (!request.devScopeUserId || !request.devScopeOrganizationId) {
      throw new BadRequestException("DevScope workspace context is missing");
    }
    return {
      userId: request.devScopeUserId,
      organizationId: request.devScopeOrganizationId,
    };
  }
}
