import { nanoid } from "nanoid";
import type { EncryptionEnvelope } from "@shannon/shared";
import { SecretVault } from "../security/secret-vault.js";
import type { StateRepository } from "../storage/state-repository.js";
import type {
  BrowserAuthStartResult,
  DeviceAuthorizationResult,
  OAuthProviderClient,
  UserProfile
} from "./oauth-provider-client.js";

interface AuthBrokerOptions {
  provider: OAuthProviderClient;
  stateRepository: StateRepository;
  vault: SecretVault;
  now?: () => string;
}

interface BrowserAuthSession {
  id: string;
  userId: string;
  mode: "browser";
  state: string;
  codeVerifier: string;
  redirectUri: string | null;
  createdAt: string;
}

interface DeviceAuthSession {
  id: string;
  userId: string;
  mode: "device";
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  createdAt: string;
}

interface ConnectionSecrets {
  accessToken: EncryptionEnvelope;
  refreshToken: EncryptionEnvelope | null;
}

export interface OpenAIConnection {
  id: string;
  userId: string;
  provider: "openai";
  profile: UserProfile;
  secrets: ConnectionSecrets;
  scope: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export class OpenAIAuthBroker {
  private readonly now: () => string;

  constructor(private readonly options: AuthBrokerOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async startBrowserLogin(input: {
    userId: string;
    redirectUri?: string;
  }): Promise<BrowserAuthStartResult & { sessionId: string }> {
    const authStart = this.options.provider.buildAuthorizationUrl({
      userId: input.userId,
      redirectUri: input.redirectUri
    });
    const session: BrowserAuthSession = {
      id: nanoid(),
      userId: input.userId,
      mode: "browser",
      state: authStart.state,
      codeVerifier: authStart.codeVerifier,
      redirectUri: input.redirectUri ?? null,
      createdAt: this.now()
    };

    await this.options.stateRepository.put("authSessions", session);

    return {
      sessionId: session.id,
      authorizationUrl: authStart.authorizationUrl,
      codeVerifier: authStart.codeVerifier,
      state: authStart.state
    };
  }

  async completeBrowserLogin(input: {
    userId: string;
    code: string;
    state: string;
  }): Promise<OpenAIConnection> {
    const session = await this.findBrowserSession(input.userId, input.state);

    const tokens = await this.options.provider.exchangeAuthorizationCode({
      code: input.code,
      codeVerifier: session.codeVerifier,
      redirectUri: session.redirectUri ?? undefined
    });
    const profile = await this.options.provider.fetchUserProfile(tokens.accessToken);

    const connection = await this.saveConnection({
      userId: input.userId,
      profile,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope
    });

    await this.options.stateRepository.delete("authSessions", session.id);
    return connection;
  }

  async startDeviceLogin(input: { userId: string }): Promise<DeviceAuthorizationResult & { sessionId: string }> {
    const authorization = await this.options.provider.startDeviceAuthorization({
      userId: input.userId
    });
    const session: DeviceAuthSession = {
      id: nanoid(),
      userId: input.userId,
      mode: "device",
      deviceCode: authorization.deviceCode,
      userCode: authorization.userCode,
      verificationUri: authorization.verificationUri,
      createdAt: this.now()
    };

    await this.options.stateRepository.put("deviceAuthSessions", session);

    return {
      sessionId: session.id,
      ...authorization
    };
  }

  async pollDeviceLogin(input: {
    userId: string;
    sessionId: string;
  }): Promise<
    | {
        status: "pending";
      }
    | {
        status: "connected";
        connection: OpenAIConnection;
      }
  > {
    const session = await this.options.stateRepository.get<DeviceAuthSession>(
      "deviceAuthSessions",
      input.sessionId
    );

    if (!session || session.userId !== input.userId) {
      throw new Error("Device authorization session not found");
    }

    const tokenSet = await this.options.provider.pollDeviceAuthorization({
      deviceCode: session.deviceCode
    });

    if (!tokenSet) {
      return {
        status: "pending"
      };
    }

    const profile = await this.options.provider.fetchUserProfile(tokenSet.accessToken);
    const connection = await this.saveConnection({
      userId: input.userId,
      profile,
      accessToken: tokenSet.accessToken,
      refreshToken: tokenSet.refreshToken,
      expiresAt: tokenSet.expiresAt,
      scope: tokenSet.scope
    });

    await this.options.stateRepository.delete("deviceAuthSessions", session.id);

    return {
      status: "connected",
      connection
    };
  }

  async getConnectionForUser(userId: string): Promise<OpenAIConnection | null> {
    const connections = await this.options.stateRepository.list<OpenAIConnection>("connections");
    const connection = connections.find((item) => item.userId === userId);
    return connection ?? null;
  }

  async logout(userId: string): Promise<void> {
    const connection = await this.getConnectionForUser(userId);

    if (connection) {
      await this.options.stateRepository.delete("connections", connection.id);
    }
  }

  private async findBrowserSession(userId: string, state: string): Promise<BrowserAuthSession> {
    const sessions = await this.options.stateRepository.list<BrowserAuthSession>("authSessions");
    const session = sessions.find((item) => item.userId === userId && item.state === state);

    if (!session) {
      throw new Error("Browser authorization session not found");
    }

    return session;
  }

  private async saveConnection(input: {
    userId: string;
    profile: UserProfile;
    accessToken: string;
    refreshToken?: string;
    expiresAt: string;
    scope: string;
  }): Promise<OpenAIConnection> {
    const now = this.now();
    const existing = await this.getConnectionForUser(input.userId);
    const connection: OpenAIConnection = {
      id: existing?.id ?? nanoid(),
      userId: input.userId,
      provider: "openai",
      profile: input.profile,
      secrets: {
        accessToken: this.options.vault.encrypt(input.accessToken),
        refreshToken: input.refreshToken ? this.options.vault.encrypt(input.refreshToken) : null
      },
      scope: input.scope,
      expiresAt: input.expiresAt,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    await this.options.stateRepository.put("connections", connection);

    return connection;
  }
}
