import type { WorkspaceSummary } from "@shannon/shared";
import {
  buildLaunchInput,
  buildResumeDraft,
  type LaunchDraft
} from "./workflow-launch.js";

const draft: LaunchDraft = {
  url: " http://localhost:3001 ",
  repo: " C:/demo/repos/demo-app ",
  workspace: " demo-workspace ",
  config: " C:/demo/configs/example-config.yaml ",
  output: " C:/demo/audit-logs "
};

describe("workflow launch helpers", () => {
  test("builds a trimmed workflow start payload", () => {
    expect(
      buildLaunchInput({
        userId: "local-cli-user",
        draft
      })
    ).toEqual({
      userId: "local-cli-user",
      url: "http://localhost:3001",
      repo: "C:/demo/repos/demo-app",
      workspace: "demo-workspace",
      config: "C:/demo/configs/example-config.yaml",
      output: "C:/demo/audit-logs"
    });
  });

  test("omits optional fields when they are blank", () => {
    expect(
      buildLaunchInput({
        userId: "local-cli-user",
        draft: {
          url: "http://localhost:3001",
          repo: "C:/demo/repos/demo-app",
          workspace: " ",
          config: "",
          output: "  "
        }
      })
    ).toEqual({
      userId: "local-cli-user",
      url: "http://localhost:3001",
      repo: "C:/demo/repos/demo-app"
    });
  });

  test("derives a resume draft from a workspace summary", () => {
    const workspace: WorkspaceSummary = {
      id: "demo-workspace",
      name: "demo-workspace",
      status: "failed",
      workflowCount: 2,
      lastWorkflowId: "workflow-2",
      lastRunAt: "2026-03-13T10:00:00.000Z",
      targetUrl: "http://localhost:3001",
      repoPath: "C:/demo/repos/demo-app"
    };

    expect(buildResumeDraft(workspace)).toEqual({
      url: "http://localhost:3001",
      repo: "C:/demo/repos/demo-app",
      workspace: "demo-workspace",
      config: "",
      output: ""
    });
  });
});
