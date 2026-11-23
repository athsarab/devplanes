import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class DevScopeSessionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

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
    if (!session || session.expires <= new Date()) {
      throw new UnauthorizedException("DevScope session is invalid or expired");
    }

    request.devScopeUserId = session.userId;

    const workspaceId = request.headers["x-devscope-workspace-id"];
    if (typeof workspaceId === "string" && workspaceId.length > 0) {
      const membership = await this.prisma.membership.findUnique({
        where: {
          userId_organizationId: {
            userId: session.userId,
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
