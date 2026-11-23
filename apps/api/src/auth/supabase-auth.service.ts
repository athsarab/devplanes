import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, SupabaseClient, User } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class SupabaseAuthService {
  private readonly client: SupabaseClient | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const url = config.get<string>("SUPABASE_URL");
    const key =
      config.get<string>("SUPABASE_SERVICE_ROLE_KEY") ??
      config.get<string>("SUPABASE_ANON_KEY");
    this.client =
      url && key
        ? createClient(url, key, {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
            },
          })
        : null;
  }

  async signUp(email: string, password: string, name?: string) {
    this.requireClient();
    if (!email || !password || password.length < 8) {
      throw new BadRequestException("A valid email and 8-character password are required");
    }
    const { data, error } = await this.client!.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: name ? { data: { name } } : undefined,
    });
    if (error) throw new BadRequestException(error.message);
    return {
      confirmationRequired: !data.session,
      user: data.user
        ? {
            id: data.user.id,
            email: data.user.email,
            name: data.user.user_metadata?.name ?? name ?? null,
          }
        : null,
      session: data.session
        ? { accessToken: data.session.access_token, expiresAt: data.session.expires_at }
        : null,
    };
  }

  async signIn(email: string, password: string) {
    this.requireClient();
    if (!email || !password) {
      throw new BadRequestException("Email and password are required");
    }
    const { data, error } = await this.client!.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) throw new UnauthorizedException("Invalid email or password");
    if (!data.session) throw new UnauthorizedException("Authentication session unavailable");
    return {
      accessToken: data.session.access_token,
      expiresAt: data.session.expires_at,
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.name ?? data.user.email,
      },
    };
  }

  async verifyAccessToken(accessToken: string): Promise<User> {
    this.requireClient();
    const { data, error } = await this.client!.auth.getUser(accessToken);
    if (error || !data.user) {
      throw new UnauthorizedException("Invalid or expired authentication session");
    }
    return data.user;
  }

  async bootstrap(accessToken: string) {
    const authUser = await this.verifyAccessToken(accessToken);
    const result = await this.resolveIdentity(authUser);
    return {
      authenticated: true,
      token: accessToken,
      expiresInSeconds: 3600,
      workspaceId: result.organizationId,
      workspaceName: result.workspaceName,
      user: {
        id: result.userId,
        email: result.email,
        name: result.name,
      },
    };
  }

  async resolveIdentity(authUser: User) {
    const email = authUser.email?.trim().toLowerCase();
    if (!email) throw new UnauthorizedException("Authenticated user has no email");
    const name =
      typeof authUser.user_metadata?.name === "string"
        ? authUser.user_metadata.name
        : typeof authUser.user_metadata?.full_name === "string"
          ? authUser.user_metadata.full_name
          : email.split("@")[0];

    let user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await this.prisma.user.create({
        data: { email, name, image: null },
      });
    } else if (user.name !== name) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { name },
      });
    }

    await this.prisma.account.upsert({
      where: {
        provider_providerAccountId: {
          provider: "supabase",
          providerAccountId: authUser.id,
        },
      },
      create: {
        userId: user.id,
        type: "oauth",
        provider: "supabase",
        providerAccountId: authUser.id,
      },
      update: { userId: user.id },
    });

    const membership = await this.prisma.membership.findFirst({
      where: { userId: user.id },
      include: { organization: true },
      orderBy: { createdAt: "asc" },
    });
    let organizationId: string;
    let workspaceName: string;
    if (membership) {
      organizationId = membership.organizationId;
      workspaceName = membership.organization.name;
    } else {
      const slugBase =
        name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ||
        "devscope";
      const slug = `${slugBase}-${randomBytes(3).toString("hex")}`;
      const organization = await this.prisma.organization.create({
        data: { name: `${name}'s Workspace`, slug },
      });
      await this.prisma.membership.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          role: "OWNER",
        },
      });
      await this.prisma.subscription.upsert({
        where: { organizationId: organization.id },
        create: {
          organizationId: organization.id,
          provider: "STRIPE",
          plan: "FREE",
          status: "ACTIVE",
        },
        update: {},
      });
      organizationId = organization.id;
      workspaceName = organization.name;
    }

    return {
      userId: user.id,
      email,
      name,
      organizationId,
      workspaceName,
    };
  }

  private requireClient() {
    if (!this.client) {
      throw new BadRequestException("Supabase authentication is not configured");
    }
  }
}
