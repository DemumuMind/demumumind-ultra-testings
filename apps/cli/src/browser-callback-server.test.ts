import { startLocalCallbackServer } from "./browser-callback-server.js";

describe("startLocalCallbackServer", () => {
  test("captures the OAuth callback query and returns the authorization code", async () => {
    const server = await startLocalCallbackServer({
      port: 0,
      host: "127.0.0.1",
      callbackPath: "/auth/callback"
    });

    try {
      const callbackPromise = server.waitForCallback();
      const response = await fetch(
        `${server.redirectUri}?code=browser-code-123&state=browser-state-123`
      );
      const html = await response.text();
      const callback = await callbackPromise;

      expect(response.status).toBe(200);
      expect(html).toContain("Authentication complete");
      expect(callback).toEqual({
        code: "browser-code-123",
        state: "browser-state-123"
      });
    } finally {
      await server.close();
    }
  });
});

