import { OpenAIAuthBroker } from "./openai-auth-broker.js";
import { SecretVault } from "../security/secret-vault.js";
import type {
  BrowserAuthStartResult,
  DeviceAuthorizationResult,
  OAuthProviderClient,
  OAuthTokenSet,
  UserProfile
} from "./oauth-provider-client.js";
import { InMemoryStateRepository } from "../storage/in-memory-state-repository.js";

class FakeOAuthProviderClient implements OAuthProviderClient {
  public lastBrowserRedirectUri: string | undefined;
  public lastExchangeRedirectUri: string | undefined;

  constructor(
    private readonly tokenSet: OAuthTokenSet,
    private readonly profile: UserProfile
  ) {}

  buildAuthorizationUrl(input?: { redirectUri?: string }): BrowserAuthStartResult {
    this.lastBrowserRedirectUri = input?.redirectUri;
    return {
      authorizationUrl: "https://auth.example.test/authorize?state=test-state",
      codeVerifier: "verifier-123",
      state: "test-state"
    };
  }

  async exchangeAuthorizationCode(input: { redirectUri?: string }): Promise<OAuthTokenSet> {
    this.lastExchangeRedirectUri = input.redirectUri;
    return this.tokenSet;
  }

  async fetchUserProfile(): Promise<UserProfile> {
    return this.profile;
  }

  async startDeviceAuthorization(): Promise<DeviceAuthorizationResult> {
    return {
      deviceCode: "device-code-123",
      userCode: "ABCD-EFGH",
      verificationUri: "https://auth.example.test/device",
      expiresInSeconds: 900,
      intervalSeconds: 1
    };
  }

  async pollDeviceAuthorization(): Promise<OAuthTokenSet | null> {
    return this.tokenSet;
  }
}

describe("OpenAIAuthBroker", () => {
  test("completes the browser login flow and stores encrypted connection secrets", async () => {
    const stateRepository = new InMemoryStateRepository();
    const broker = new OpenAIAuthBroker({
      provider: new FakeOAuthProviderClient(
        {
          accessToken: "access-token-123",
          refreshToken: "refresh-token-123",
          expiresAt: "2026-03-13T18:00:00.000Z",
          scope: "openid profile email"
        },
        {
          providerUserId: "user-openai-1",
          email: "analyst@example.com",
          name: "Analyst"
        }
      ),
      stateRepository,
      vault: new SecretVault({
        encryptionKey: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
      })
    });

    const started = await broker.startBrowserLogin({
      userId: "user-1"
    });

    expect(started.authorizationUrl).toContain("state=test-state");

    const connection = await broker.completeBrowserLogin({
      userId: "user-1",
      code: "returned-auth-code",
      state: started.state
    });

    expect(connection.userId).toBe("user-1");
    expect(connection.profile.email).toBe("analyst@example.com");
    expect(connection.secrets.accessToken.ciphertext).not.toContain("access-token-123");

    const current = await broker.getConnectionForUser("user-1");

    expect(current?.profile.name).toBe("Analyst");
  });

  test("supports device authorization polling until a connection is established", async () => {
    const provider = new FakeOAuthProviderClient(
      {
        accessToken: "access-token-999",
        refreshToken: "refresh-token-999",
        expiresAt: "2026-03-13T18:00:00.000Z",
        scope: "openid profile email"
      },
      {
        providerUserId: "user-openai-2",
        email: "device@example.com",
        name: "Device User"
      }
    );
    let pollCount = 0;
    provider.pollDeviceAuthorization = async () => {
      pollCount += 1;
      return pollCount === 1
        ? null
        : {
            accessToken: "access-token-999",
            refreshToken: "refresh-token-999",
            expiresAt: "2026-03-13T18:00:00.000Z",
            scope: "openid profile email"
          };
    };

    const broker = new OpenAIAuthBroker({
      provider,
      stateRepository: new InMemoryStateRepository(),
      vault: new SecretVault({
        encryptionKey: "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd"
      })
    });

    const started = await broker.startDeviceLogin({
      userId: "user-2"
    });

    expect(started.userCode).toBe("ABCD-EFGH");

    const firstPoll = await broker.pollDeviceLogin({
      userId: "user-2",
      sessionId: started.sessionId
    });

    expect(firstPoll.status).toBe("pending");

    const secondPoll = await broker.pollDeviceLogin({
      userId: "user-2",
      sessionId: started.sessionId
    });

    expect(secondPoll.status).toBe("connected");
    expect(secondPoll.connection?.profile.email).toBe("device@example.com");
  });

  test("passes redirect URI overrides through the browser auth flow", async () => {
    const provider = new FakeOAuthProviderClient(
      {
        accessToken: "access-token-321",
        refreshToken: "refresh-token-321",
        expiresAt: "2026-03-13T18:00:00.000Z",
        scope: "openid profile email"
      },
      {
        providerUserId: "user-openai-3",
        email: "browser@example.com",
        name: "Browser User"
      }
    );
    const broker = new OpenAIAuthBroker({
      provider,
      stateRepository: new InMemoryStateRepository(),
      vault: new SecretVault({
        encryptionKey: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      })
    });

    const started = await broker.startBrowserLogin({
      userId: "user-3",
      redirectUri: "http://127.0.0.1:1455/auth/callback"
    });

    await broker.completeBrowserLogin({
      userId: "user-3",
      code: "returned-auth-code",
      state: started.state
    });

    expect(provider.lastBrowserRedirectUri).toBe("http://127.0.0.1:1455/auth/callback");
    expect(provider.lastExchangeRedirectUri).toBe("http://127.0.0.1:1455/auth/callback");
  });
});
