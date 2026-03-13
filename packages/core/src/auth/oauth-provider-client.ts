export interface BrowserAuthStartResult {
  authorizationUrl: string;
  codeVerifier: string;
  state: string;
}

export interface DeviceAuthorizationResult {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresInSeconds: number;
  intervalSeconds: number;
}

export interface OAuthTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
  scope: string;
}

export interface UserProfile {
  providerUserId: string;
  email: string;
  name: string;
}

export interface OAuthProviderClient {
  buildAuthorizationUrl(input?: {
    userId?: string;
    redirectUri?: string;
  }): BrowserAuthStartResult;
  exchangeAuthorizationCode(input: {
    code: string;
    codeVerifier: string;
    redirectUri?: string;
  }): Promise<OAuthTokenSet>;
  fetchUserProfile(accessToken: string): Promise<UserProfile>;
  startDeviceAuthorization(input?: {
    userId?: string;
  }): Promise<DeviceAuthorizationResult>;
  pollDeviceAuthorization(input: {
    deviceCode: string;
  }): Promise<OAuthTokenSet | null>;
}
