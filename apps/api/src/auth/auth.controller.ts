import {
  Controller,
  ForbiddenException,
  Get, 
  Body,
  Headers,
  Post,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { SupabaseAuthService } from "./supabase-auth.service";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly supabaseAuth: SupabaseAuthService,
  ) {}

  @Get("session")
  getSession() {
    return {
      authenticated: false,
      user: null,
    };
  }

  @Post("signup")
  async signup(
    @Body("email") email: string,
    @Body("password") password: string,
    @Body("name") name?: string,
  ) {
    return this.supabaseAuth.signUp(email, password, name);
  }

  @Post("signin")
  async signin(
    @Body("email") email: string,
    @Body("password") password: string,
  ) {
    return this.supabaseAuth.signIn(email, password);
  }

  @Post("session/bootstrap")
  async bootstrap(@Headers("authorization") authorization: string) {
    if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) {
      throw new ForbiddenException("Bearer authentication session required");
    }
    return this.supabaseAuth.bootstrap(authorization.slice("Bearer ".length).trim());
  }

  @Post("demo/session")
  async createDemoSession() {
    if ((this.config.get<string>("NODE_ENV") ?? "development") === "production") {
      throw new ForbiddenException("Demo authentication is disabled");
    }
    if (this.config.get<string>("DEVSCAPE_DEMO_AUTH") === "false") {
      throw new ForbiddenException("Demo authentication is disabled");
    }

    const email =
      this.config.get<string>("DEVSCAPE_DEMO_EMAIL") ?? "demo@devscope.local";
    const organizationSlug =
      this.config.get<string>("DEVSCAPE_DEMO_WORKSPACE") ?? "devscope-demo";

    const user = await this.prisma.user.upsert({
      where: { email },
      create: {
        email,
        name: "DevScope Demo",
      },
      update: {
        name: "DevScope Demo",
      },
    });

    const organization = await this.prisma.organization.upsert({
      where: { slug: organizationSlug },
      create: {
        name: "DevScope Demo Workspace",
        slug: organizationSlug,
      },
      update: {},
    });

    await this.prisma.membership.upsert({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: organization.id,
        },
      },
      create: {
        userId: user.id,
        organizationId: organization.id,
        role: "OWNER",
      },
      update: {
        role: "OWNER",
      },
    });

    await this.prisma.subscription.upsert({
      where: { organizationId: organization.id },
      create: {
        organizationId: organization.id,
        provider: "STRIPE",
        plan: "PRO",
        status: "ACTIVE",
      },
      update: {},
    });

    await this.prisma.session.deleteMany({
      where: {
        userId: user.id,
        expires: { lte: new Date() },
      },
    });
    const token = randomBytes(32).toString("base64url");
    await this.prisma.session.create({
      data: {
        sessionToken: token,
        userId: user.id,
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    return {
      authenticated: true,
      token,
      expiresInSeconds: 24 * 60 * 60,
      workspaceId: organization.id,
      workspaceName: organization.name,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  }
}
