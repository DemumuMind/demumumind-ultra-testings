import { createDesktopLaunchPlan } from "./main.js";

describe("createDesktopLaunchPlan", () => {
  test("uses packaged web assets and local daemon defaults for Windows packaging", () => {
    const plan = createDesktopLaunchPlan({
      cwd: "C:/demo/apps/desktop",
      isPackaged: true,
      env: {}
    });

    expect(plan.windowTitle).toBe("DemumuMind Ultra Testings");
    expect(plan.daemonUrl).toBe("http://127.0.0.1:4000");
    expect(plan.webEntry).toContain("apps/web/dist/index.html");
    expect(plan.daemonEntry).toContain("apps/server/dist/index.js");
    expect(plan.runtimeComposeFile).toContain("docker-compose.yml");
    expect(plan.runtimeServices).toEqual(["temporal", "worker"]);
  });

  test("prefers explicit development URLs when running the desktop shell locally", () => {
    const plan = createDesktopLaunchPlan({
      cwd: "C:/demo/apps/desktop",
      isPackaged: false,
      env: {
        DEMUMUMIND_WEB_URL: "http://127.0.0.1:4173",
        DEMUMUMIND_SERVER_URL: "http://127.0.0.1:4100"
      }
    });

    expect(plan.webEntry).toBe("http://127.0.0.1:4173");
    expect(plan.daemonUrl).toBe("http://127.0.0.1:4100");
    expect(plan.runtimeComposeFile).toContain("docker-compose.yml");
  });
});
