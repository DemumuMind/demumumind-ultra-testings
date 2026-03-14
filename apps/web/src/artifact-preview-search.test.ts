import type { WorkspaceArtifactPreview } from "@shannon/shared";
import { buildArtifactPreviewSearchView } from "./artifact-preview-search.js";

const preview: WorkspaceArtifactPreview = {
  artifact: {
    kind: "workflow-log",
    label: "Workflow Log",
    path: "C:/demo/audit-logs/demo-workspace/workflow.log",
    exists: true
  },
  contentType: "text/plain",
  content: [
    "[2026-03-13T10:00:00.000Z] [workflow] Initialized workflow-1",
    "[2026-03-13T10:00:05.000Z] [phase] START preflight",
    "[2026-03-13T10:00:10.000Z] [phase] START recon"
  ].join("\n"),
  truncated: false
};

describe("artifact preview search", () => {
  test("counts case-insensitive matches and exposes highlighted segments", () => {
    const view = buildArtifactPreviewSearchView(preview, "start");

    expect(view.query).toBe("start");
    expect(view.matchCount).toBe(2);
    expect(view.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: "START",
          match: true,
          matchIndex: 0
        })
      ])
    );
    expect(
      view.segments.filter((segment) => segment.match).map((segment) => segment.matchIndex)
    ).toEqual([0, 1]);
  });

  test("returns the raw content as a single segment when query is empty", () => {
    const view = buildArtifactPreviewSearchView(preview, "   ");

    expect(view.query).toBe("");
    expect(view.matchCount).toBe(0);
    expect(view.segments).toEqual([
      {
        text: preview.content,
        match: false
      }
    ]);
  });
});
