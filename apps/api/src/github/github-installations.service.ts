import {
  BadRequestException,
  GoneException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { createHmac, createHash, randomBytes, timingSafeEqual } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { GitHubConfigService } from "./github-config.service";
import type { Octokit } from "@octokit/rest";
import { BillingService } from "../billing/billing.service";

type SessionContext = {
  userId: string;
  organizationId: string;
};

type GitHubRepository = {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  default_branch: string;
  language: string | null;
  archived: boolean;
  owner: { login: string };
};

@Injectable()
export class GitHubInstallationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: GitHubConfigService,
    private readonly billing: BillingService,
  ) {}

  async startInstallation(context: SessionContext) {
    const rawState = randomBytes(32).toString("base64url");
    const stateHash = this.hashState(rawState);
    await this.prisma.gitHubInstallationState.create({
      data: {
        stateHash,
        userId: context.userId,
        organizationId: context.organizationId,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    const url = new URL(this.config.setupUrl);
    url.searchParams.set("state", rawState);
    return { url: url.toString() };
  }

  async completeInstallation(
    state: string | undefined,
    installationIdValue: string | undefined,
  ) {
    if (!state || !installationIdValue) {
      throw new BadRequestException("GitHub callback is missing state or installation ID");
    }
    const installationId = Number(installationIdValue);
    if (!Number.isSafeInteger(installationId) || installationId <= 0) {
      throw new BadRequestException("Invalid GitHub installation ID");
    }

    const stateHash = this.hashState(state);
    const pending = await this.prisma.gitHubInstallationState.findUnique({
      where: { stateHash },
    });
    if (
      !pending ||
      pending.consumedAt ||
      pending.expiresAt <= new Date() ||
      !pending.userId ||
      !pending.organizationId
    ) {
      throw new UnauthorizedException("Invalid or expired GitHub installation state");
    }

    await this.prisma.gitHubInstallationState.update({
      where: { id: pending.id },
      data: { consumedAt: new Date() },
    });

    const app = this.config.createApp();
    const installationOctokit = await app.getInstallationOctokit(installationId);
    const installationResponse = await app.octokit.request(
      "GET /app/installations/{installation_id}",
      { installation_id: installationId },
    );
    const installation = installationResponse.data;
    if (installation.suspended_at) {
      throw new GoneException("This GitHub App installation is suspended");
    }

    const accountId = installation.account && "id" in installation.account
      ? installation.account.id
      : 0;
    const accountLogin = installation.account && "login" in installation.account
      ? installation.account.login
      : "unknown";
    const accountType = installation.account && "type" in installation.account
      ? installation.account.type
      : "Organization";

    const existingInstallation = await this.prisma.gitHubInstallation.findUnique({
      where: { installationId: BigInt(installationId) },
    });
    if (
      existingInstallation &&
      existingInstallation.organizationId !== pending.organizationId &&
      existingInstallation.status !== "UNINSTALLED"
    ) {
      throw new UnauthorizedException(
        "This GitHub installation is already associated with another workspace",
      );
    }

    const record = await this.prisma.gitHubInstallation.upsert({
      where: { installationId: BigInt(installationId) },
      create: {
        installationId: BigInt(installationId),
        organizationId: pending.organizationId,
        accountId: BigInt(accountId),
        accountLogin,
        accountType,
        status: "ACTIVE",
        repositorySelection: installation.repository_selection ?? "selected",
      },
      update: {
        organizationId: pending.organizationId,
        accountId: BigInt(accountId),
        accountLogin,
        accountType,
        status: "ACTIVE",
        repositorySelection: installation.repository_selection ?? "selected",
        suspendedAt: null,
        uninstalledAt: null,
      },
    });

    await this.prisma.gitHubAccount.upsert({
      where: { githubUserId: BigInt(accountId) },
      create: {
        userId: pending.userId,
        githubUserId: BigInt(accountId),
        login: accountLogin,
        avatarUrl:
          installation.account && "avatar_url" in installation.account
            ? installation.account.avatar_url
            : null,
      },
      update: {
        userId: pending.userId,
        login: accountLogin,
        avatarUrl:
          installation.account && "avatar_url" in installation.account
            ? installation.account.avatar_url
            : null,
      },
    });

    await this.refreshRepositorySelection(
      record.id,
      installationId,
      installationOctokit as unknown as Octokit,
    );
    return { installationId, status: "connected" };
  }

  async listAccessibleRepositories(context: SessionContext) {
    return this.prisma.connectedRepository.findMany({
      where: {
        disconnectedAt: null,
        installation: {
          organizationId: context.organizationId,
          status: "ACTIVE",
        },
      },
      orderBy: { fullName: "asc" },
    });
  }

  async listInstallations(context: SessionContext) {
    return this.prisma.gitHubInstallation.findMany({
      where: {
        organizationId: context.organizationId,
        status: { in: ["ACTIVE", "SUSPENDED"] },
      },
      include: {
        repositories: {
          where: { disconnectedAt: null },
          orderBy: { fullName: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async refreshAccessibleRepositories(context: SessionContext, installationId: number) {
    const installation = await this.prisma.gitHubInstallation.findFirst({
      where: {
        installationId: BigInt(installationId),
        organizationId: context.organizationId,
        status: "ACTIVE",
      },
    });
    if (!installation) {
      throw new NotFoundException("GitHub installation was not found");
    }

    const octokit = await this.config.createApp().getInstallationOctokit(installationId);
    await this.refreshRepositorySelection(
      installation.id,
      installationId,
      octokit as unknown as Octokit,
    );
  }

  async disconnectRepository(context: SessionContext, repositoryId: string) {
    const repository = await this.prisma.connectedRepository.findFirst({
      where: {
        id: repositoryId,
        disconnectedAt: null,
        installation: { organizationId: context.organizationId },
      },
    });
    if (!repository) {
      throw new NotFoundException("Connected repository was not found");
    }

    await this.prisma.connectedRepository.update({
      where: { id: repository.id },
      data: { disconnectedAt: new Date() },
    });
  }

  async handleWebhook(rawBody: Buffer, signature: string | undefined, event: string | undefined, payload: unknown) {
    if (!signature || !event) {
      throw new UnauthorizedException("Missing webhook signature or event");
    }
    const expected = `sha256=${createHmac("sha256", this.config.webhookSecret)
      .update(rawBody)
      .digest("hex")}`;
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (
      actualBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(actualBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException("Invalid GitHub webhook signature");
    }

    const body = payload as {
      action?: string;
      installation?: { id: number; account?: { id: number } };
      repositories_added?: GitHubRepository[];
      repositories_removed?: GitHubRepository[];
    };

    if (event === "installation" && body.installation) {
      const installationId = BigInt(body.installation.id);
      if (body.action === "deleted") {
        await this.prisma.gitHubInstallation.updateMany({
          where: { installationId },
          data: { status: "UNINSTALLED", uninstalledAt: new Date() },
        });
        await this.prisma.connectedRepository.updateMany({
          where: { installation: { installationId } },
          data: { disconnectedAt: new Date() },
        });
      } else if (body.action === "suspend") {
        await this.prisma.gitHubInstallation.updateMany({
          where: { installationId },
          data: { status: "SUSPENDED", suspendedAt: new Date() },
        });
      } else if (body.action === "unsuspend") {
        await this.prisma.gitHubInstallation.updateMany({
          where: { installationId },
          data: { status: "ACTIVE", suspendedAt: null },
        });
      }
    }

    if (event === "installation_repositories" && body.installation) {
      const installation = await this.prisma.gitHubInstallation.findUnique({
        where: { installationId: BigInt(body.installation.id) },
      });
      if (!installation) return;

      for (const removed of body.repositories_removed ?? []) {
        await this.prisma.connectedRepository.updateMany({
          where: { installationId: installation.id, githubRepoId: BigInt(removed.id) },
          data: { disconnectedAt: new Date() },
        });
      }
      for (const added of body.repositories_added ?? []) {
        await this.upsertConnectedRepository(installation.id, added);
      }
    }
  }

  private async refreshRepositorySelection(
    installationRecordId: string,
    installationId: number,
    octokit: Octokit,
  ) {
    const repositories: GitHubRepository[] = [];
    for await (const response of octokit.paginate.iterator(
      "GET /installation/repositories",
      { per_page: 100 },
    )) {
      // The REST pagination plugin normalizes list responses and exposes the
      // endpoint's collection directly as `data` (not `{ repositories: [] }`).
      const page = response.data as GitHubRepository[];
      if (!Array.isArray(page)) {
        throw new Error("GitHub returned an unexpected repository list response");
      }
      repositories.push(...page);
    }

    const installationRecord = await this.prisma.gitHubInstallation.findUnique({
      where: { id: installationRecordId },
    });
    if (!installationRecord) return;
    const entitlements = await this.billing.getEffectiveEntitlements(
      installationRecord.organizationId,
    );
    const selectableRepositories = repositories.slice(0, entitlements.repositoryLimit);

    await this.prisma.connectedRepository.updateMany({
      where: {
        installationId: installationRecordId,
        githubRepoId: {
          notIn: selectableRepositories.map((repository) => BigInt(repository.id)),
        },
      },
      data: { disconnectedAt: new Date() },
    });

    for (const repository of selectableRepositories) {
      await this.upsertConnectedRepository(installationRecordId, repository);
    }
  }

  private async upsertConnectedRepository(
    installationRecordId: string,
    repository: GitHubRepository,
  ) {
    await this.prisma.connectedRepository.upsert({
      where: { githubRepoId: BigInt(repository.id) },
      create: {
        installationId: installationRecordId,
        githubRepoId: BigInt(repository.id),
        owner: repository.owner.login,
        name: repository.name,
        fullName: repository.full_name,
        description: repository.description,
        visibility: repository.private ? "private" : "public",
        defaultBranch: repository.default_branch,
        primaryLanguage: repository.language,
        isArchived: repository.archived,
        disconnectedAt: null,
      },
      update: {
        installationId: installationRecordId,
        owner: repository.owner.login,
        name: repository.name,
        fullName: repository.full_name,
        description: repository.description,
        visibility: repository.private ? "private" : "public",
        defaultBranch: repository.default_branch,
        primaryLanguage: repository.language,
        isArchived: repository.archived,
        disconnectedAt: null,
      },
    });
  }

  private hashState(state: string): string {
    return createHash("sha256").update(state).digest("hex");
  }
}
