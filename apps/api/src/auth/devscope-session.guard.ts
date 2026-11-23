import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SupabaseAuthService } from "./supabase-auth.service";

@Injectable()
export class DevScopeSessionGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseAuth: SupabaseAuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      devScopeUserId?: string;
      devScopeOrganizationId?: string;
    }>();
    const authorization = request.headers.authorization;
    if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) {
      throw new UnauthorizedException("DevScope session required");
    }

    const token = authorization.slice("Bearer ".length).trim();
    const session = await this.prisma.session.findUnique({
      where: { sessionToken: token },
      include: { user: true },
    });
    let userId: string;
    if (session && session.expires > new Date()) {
      userId = session.userId;
    } else {
      const authUser = await this.supabaseAuth.verifyAccessToken(token);
      const identity = await this.supabaseAuth.resolveIdentity(authUser);
      userId = identity.userId;
    }
    request.devScopeUserId = userId;

    const workspaceId = request.headers["x-devscope-workspace-id"];
    if (typeof workspaceId === "string" && workspaceId.length > 0) {
      const membership = await this.prisma.membership.findUnique({
        where: {
          userId_organizationId: {
            userId,
            organizationId: workspaceId,
          },
        },
      });
      if (!membership || membership.role === "VIEWER") {
        throw new UnauthorizedException("Workspace access denied");
      }
      request.devScopeOrganizationId = workspaceId;
    }

    return true;
  }
}
