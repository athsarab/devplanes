import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { App } from "@octokit/app";
import { Octokit } from "@octokit/rest";

@Injectable()
export class GitHubConfigService {
  constructor(private readonly config: ConfigService) {}

  require(key: string): string {
    const value = this.config.get<string>(key);
    if (!value) {
      throw new InternalServerErrorException(`Server configuration ${key} is missing`);
    }
    return value;
  }

  get setupUrl(): string {
    return this.require("GITHUB_APP_INSTALL_URL");
  }

  get webhookSecret(): string {
    return this.require("GITHUB_APP_WEBHOOK_SECRET");
  }

  get webCallbackUrl(): string {
    return this.require("GITHUB_APP_WEB_CALLBACK_URL");
  }

  get status() {
    const values = {
      appId: this.config.get<string>("GITHUB_APP_ID"),
      clientId: this.config.get<string>("GITHUB_APP_CLIENT_ID"),
      privateKey: this.config.get<string>("GITHUB_APP_PRIVATE_KEY"),
      webhookSecret: this.config.get<string>("GITHUB_APP_WEBHOOK_SECRET"),
      installUrl: this.config.get<string>("GITHUB_APP_INSTALL_URL"),
    };
    const placeholder = (value: string | undefined) =>
      !value ||
      value.includes("replace-with") ||
      value.includes("replace-me");
    return {
      configured:
        !placeholder(values.appId) &&
        !placeholder(values.clientId) &&
        !placeholder(values.privateKey) &&
        !placeholder(values.webhookSecret) &&
        !placeholder(values.installUrl),
    };
  }

  createApp(): App {
    return new App({
      appId: this.require("GITHUB_APP_ID"),
      privateKey: this.require("GITHUB_APP_PRIVATE_KEY").replace(/\\n/g, "\n"),
      oauth: {
        clientId: this.require("GITHUB_APP_CLIENT_ID"),
        clientSecret: this.require("GITHUB_APP_CLIENT_SECRET"),
      },
      webhooks: {
        secret: this.require("GITHUB_APP_WEBHOOK_SECRET"),
      },
      // @octokit/app defaults to @octokit/core, which does not include the
      // REST endpoint and pagination plugins used by the GitHub services.
      Octokit,
    });
  }
}
