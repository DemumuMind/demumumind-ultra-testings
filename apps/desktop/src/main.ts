import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";

export interface DesktopLaunchPlan {
  windowTitle: string;
  webEntry: string;
  daemonEntry: string;
  daemonUrl: string;
  runtimeComposeFile: string;
  runtimeServices: string[];
  workspaceRoot: string;
}

export interface DesktopLaunchPlanInput {
  cwd: string;
  isPackaged: boolean;
  env: Record<string, string | undefined>;
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

export function createDesktopLaunchPlan(input: DesktopLaunchPlanInput): DesktopLaunchPlan {
  const workspaceRoot = resolve(input.cwd, "..", "..");
  const daemonUrl = input.env.DEMUMUMIND_SERVER_URL ?? "http://127.0.0.1:4000";

  return {
    windowTitle: "DemumuMind Ultra Testings",
    webEntry: input.isPackaged
      ? normalizePath(resolve(workspaceRoot, "apps", "web", "dist", "index.html"))
      : input.env.DEMUMUMIND_WEB_URL ?? "http://127.0.0.1:4173",
    daemonEntry: normalizePath(resolve(workspaceRoot, "apps", "server", "dist", "index.js")),
    daemonUrl,
    runtimeComposeFile: normalizePath(resolve(workspaceRoot, "docker-compose.yml")),
    runtimeServices: ["temporal", "worker"],
    workspaceRoot: normalizePath(workspaceRoot)
  };
}

function extractPort(daemonUrl: string): string {
  return new URL(daemonUrl).port || "4000";
}

function startManagedDaemon(plan: DesktopLaunchPlan, env: NodeJS.ProcessEnv): ChildProcess {
  return spawn(process.execPath, [plan.daemonEntry], {
    env: {
      ...env,
      ELECTRON_RUN_AS_NODE: "1",
      HOST: "127.0.0.1",
      PORT: extractPort(plan.daemonUrl)
    },
    stdio: "ignore"
  });
}

function startManagedRuntime(plan: DesktopLaunchPlan, env: NodeJS.ProcessEnv): ChildProcess {
  return spawn(
    "docker",
    ["compose", "-f", plan.runtimeComposeFile, "up", "-d", ...plan.runtimeServices],
    {
      cwd: plan.workspaceRoot,
      env,
      stdio: "ignore",
      windowsHide: true
    }
  );
}

function stopManagedRuntime(plan: DesktopLaunchPlan, env: NodeJS.ProcessEnv): ChildProcess {
  return spawn(
    "docker",
    ["compose", "-f", plan.runtimeComposeFile, "stop", ...plan.runtimeServices],
    {
      cwd: plan.workspaceRoot,
      env,
      stdio: "ignore",
      windowsHide: true
    }
  );
}

export async function launchDesktopShell(
  input: Partial<DesktopLaunchPlanInput> = {}
): Promise<void> {
  const plan = createDesktopLaunchPlan({
    cwd: input.cwd ?? process.cwd(),
    isPackaged: input.isPackaged ?? false,
    env: input.env ?? process.env
  });
  const electron = await import("electron");
  const { app, BrowserWindow } = electron;
  let runtimeProcess: ChildProcess | null = null;
  let daemonProcess: ChildProcess | null = null;

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("before-quit", () => {
    daemonProcess?.kill();
    runtimeProcess?.kill();
    void stopManagedRuntime(plan, process.env);
  });

  app.whenReady().then(async () => {
    runtimeProcess = startManagedRuntime(plan, process.env);
    daemonProcess = startManagedDaemon(plan, process.env);

    const window = new BrowserWindow({
      width: 1440,
      height: 960,
      minWidth: 1180,
      minHeight: 760,
      title: plan.windowTitle,
      autoHideMenuBar: true,
      backgroundColor: "#0f172a",
      webPreferences: {
        contextIsolation: true,
        sandbox: false
      }
    });

    if (plan.webEntry.startsWith("http://") || plan.webEntry.startsWith("https://")) {
      await window.loadURL(plan.webEntry);
    } else {
      await window.loadFile(plan.webEntry);
    }
  });
}
