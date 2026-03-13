import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStateRepository } from "./file-state-repository.js";

describe("FileStateRepository", () => {
  test("persists records across repository instances", async () => {
    const directory = await mkdtemp(join(tmpdir(), "shannon-state-"));

    try {
      const firstRepository = new FileStateRepository({
        dataDirectory: directory
      });

      await firstRepository.put("targets", {
        id: "target-1",
        name: "Demo target"
      });

      const secondRepository = new FileStateRepository({
        dataDirectory: directory
      });

      const targets = await secondRepository.list<{ id: string; name: string }>("targets");

      expect(targets).toEqual([
        {
          id: "target-1",
          name: "Demo target"
        }
      ]);
    } finally {
      await rm(directory, {
        recursive: true,
        force: true
      });
    }
  });

  test("does not lose records when multiple writes hit the same collection concurrently", async () => {
    const directory = await mkdtemp(join(tmpdir(), "shannon-state-"));

    try {
      const repository = new FileStateRepository({
        dataDirectory: directory
      });

      await Promise.all([
        repository.put("confirmedFindings", {
          id: "finding-1",
          title: "First"
        }),
        repository.put("confirmedFindings", {
          id: "finding-2",
          title: "Second"
        })
      ]);

      const findings = await repository.list<{ id: string; title: string }>("confirmedFindings");

      expect(findings).toHaveLength(2);
      expect(findings).toEqual(
        expect.arrayContaining([
          {
            id: "finding-1",
            title: "First"
          },
          {
            id: "finding-2",
            title: "Second"
          }
        ])
      );
    } finally {
      await rm(directory, {
        recursive: true,
        force: true
      });
    }
  });
});
