import { createHash, randomBytes } from "node:crypto";
import type {
  BrowserAuthStartResult,
  DeviceAuthorizationResult,
  OAuthProviderClient,
  OAuthTokenSet,
  UserProfile
} from "@shannon/core";

interface ConfiguredOAuthProviderOptions {
  authorizationUrl: string;
  tokenUrl: string;
  deviceAuthorizationUrl: string;
  userInfoUrl: string;
  clientId: string;
  redirectUri: string;
  scope: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}

function toBase64Url(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string; error_description?: string };

  if (!response.ok) {
    throw new Error(data.error_description ?? data.error ?? `Request failed with status ${response.status}`);
  }

  return data;
}

export class ConfiguredOAuthProviderClient implements OAuthProviderClient {
  constructor(private readonly options: ConfiguredOAuthProviderOptions) {}

  buildAuthorizationUrl(input?: { redirectUri?: string }): BrowserAuthStartResult {
    const state = toBase64Url(randomBytes(16));
    const codeVerifier = toBase64Url(randomBytes(32));
    const codeChallenge = toBase64Url(createHash("sha256").update(codeVerifier).digest());
    const url = new URL(this.options.authorizationUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.options.clientId);
    url.searchParams.set("redirect_uri", input?.redirectUri ?? this.options.redirectUri);
    url.searchParams.set("scope", this.options.scope);
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");

    return {
      authorizationUrl: url.toString(),
      state,
      codeVerifier
    };
  }

  async exchangeAuthorizationCode(input: {
    code: string;
    codeVerifier: string;
    redirectUri?: string;
  }): Promise<OAuthTokenSet> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      client_id: this.options.clientId,
      redirect_uri: input.redirectUri ?? this.options.redirectUri,
      code_verifier: input.codeVerifier
    });
    const response = await fetch(this.options.tokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body
    });
    const token = await readJson<TokenResponse>(response);

    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: new Date(Date.now() + (token.expires_in ?? 3600) * 1000).toISOString(),
      scope: token.scope ?? this.options.scope
    };
  }

  async fetchUserProfile(accessToken: string): Promise<UserProfile> {
    const response = await fetch(this.options.userInfoUrl, {
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    const profile = await readJson<{
      sub: string;
      email?: string;
      name?: string;
    }>(response);

    return {
      providerUserId: profile.sub,
      email: profile.email ?? `${profile.sub}@unknown.local`,
      name: profile.name ?? profile.sub
    };
  }

  async startDeviceAuthorization(): Promise<DeviceAuthorizationResult> {
    const body = new URLSearchParams({
      client_id: this.options.clientId,
      scope: this.options.scope
    });
    const response = await fetch(this.options.deviceAuthorizationUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body
    });
    const payload = await readJson<{
      device_code: string;
      user_code: string;
      verification_uri: string;
      expires_in: number;
      interval?: number;
    }>(response);

    return {
      deviceCode: payload.device_code,
      userCode: payload.user_code,
      verificationUri: payload.verification_uri,
      expiresInSeconds: payload.expires_in,
      intervalSeconds: payload.interval ?? 5
    };
  }

  async pollDeviceAuthorization(input: { deviceCode: string }): Promise<OAuthTokenSet | null> {
    const body = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      client_id: this.options.clientId,
      device_code: input.deviceCode
    });
    const response = await fetch(this.options.tokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body
    });

    if (!response.ok) {
      const error = (await response.json()) as { error?: string };

      if (error.error === "authorization_pending") {
        return null;
      }

      throw new Error(error.error ?? `Request failed with status ${response.status}`);
    }

    const token = (await response.json()) as TokenResponse;
    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: new Date(Date.now() + (token.expires_in ?? 3600) * 1000).toISOString(),
      scope: token.scope ?? this.options.scope
    };
  }
}

export class DemoOAuthProviderClient implements OAuthProviderClient {
  buildAuthorizationUrl(): BrowserAuthStartResult {
    return {
      authorizationUrl: "https://auth.example.test/authorize?state=demo-browser-state",
      state: "demo-browser-state",
      codeVerifier: "demo-code-verifier"
    };
  }

  async exchangeAuthorizationCode(): Promise<OAuthTokenSet> {
    return {
      accessToken: "demo-access-token",
      refreshToken: "demo-refresh-token",
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      scope: "openid profile email"
    };
  }

  async fetchUserProfile(): Promise<UserProfile> {
    return {
      providerUserId: "demo-user",
      email: "demo.operator@example.test",
      name: "Demo Operator"
    };
  }

  async startDeviceAuthorization(): Promise<DeviceAuthorizationResult> {
    return {
      deviceCode: "demo-device-code",
      userCode: "DEMO-CODE",
      verificationUri: "https://auth.example.test/device",
      expiresInSeconds: 900,
      intervalSeconds: 5
    };
  }

  async pollDeviceAuthorization(): Promise<OAuthTokenSet | null> {
    return {
      accessToken: "demo-access-token",
      refreshToken: "demo-refresh-token",
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      scope: "openid profile email"
    };
  }
}
