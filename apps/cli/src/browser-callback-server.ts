import { createServer } from "node:http";

export interface BrowserCallbackResult {
  code: string;
  state: string;
}

export interface BrowserCallbackServer {
  redirectUri: string;
  waitForCallback(timeoutMs?: number): Promise<BrowserCallbackResult>;
  close(): Promise<void>;
}

interface StartLocalCallbackServerOptions {
  host?: string;
  port?: number;
  callbackPath?: string;
}

const DEFAULT_CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;

export async function startLocalCallbackServer(
  options: StartLocalCallbackServerOptions = {}
): Promise<BrowserCallbackServer> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 1455;
  const callbackPath = options.callbackPath ?? "/auth/callback";

  let resolveCallback!: (value: BrowserCallbackResult) => void;
  let rejectCallback!: (error: Error) => void;
  const callbackPromise = new Promise<BrowserCallbackResult>((resolve, reject) => {
    resolveCallback = resolve;
    rejectCallback = reject;
  });

  const server = createServer((request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", `http://${host}:${port}`);

      if (requestUrl.pathname !== callbackPath) {
        response.writeHead(404, {
          "content-type": "text/plain; charset=utf-8"
        });
        response.end("Not found");
        return;
      }

      const code = requestUrl.searchParams.get("code");
      const state = requestUrl.searchParams.get("state");

      if (!code || !state) {
        response.writeHead(400, {
          "content-type": "text/plain; charset=utf-8"
        });
        response.end("Missing code or state query parameters");
        return;
      }

      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8"
      });
      response.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Shannon Lite+ Login Complete</title>
  </head>
  <body style="font-family: sans-serif; background:#081318; color:#f4fbf9; padding:2rem;">
    <h1>Authentication complete</h1>
    <p>You can return to the terminal window.</p>
  </body>
</html>`);

      resolveCallback({
        code,
        state
      });
    } catch (error) {
      rejectCallback(error as Error);
      response.writeHead(500, {
        "content-type": "text/plain; charset=utf-8"
      });
      response.end("Callback server error");
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  const redirectUri = `http://${host}:${actualPort}${callbackPath}`;

  return {
    redirectUri,
    waitForCallback(timeoutMs = DEFAULT_CALLBACK_TIMEOUT_MS) {
      return Promise.race([
        callbackPromise,
        new Promise<BrowserCallbackResult>((_, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Timed out waiting for browser login callback"));
          }, timeoutMs);
          callbackPromise.finally(() => clearTimeout(timeout)).catch(() => {
            clearTimeout(timeout);
          });
        })
      ]);
    },
    close() {
      return new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  };
}

