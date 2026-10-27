import { describe, expect, it } from "vitest";
import { mergeWorkspacePayloads } from "../src/services/workspaceSync";

describe("River v0.21 workspace conflict merge", () => {
  it("keeps local-only notes and remote-only notes while preferring the newer version of the same note", () => {
    const local = {
      format: "river-backup",
      version: 2,
      notes: [
        { id: "shared", title: "local older", updatedAt: "2026-10-26T04:00:00.000Z" },
        { id: "local-only", title: "CH02 local only", updatedAt: "2026-10-27T01:00:00.000Z" },
      ],
      learningMaps: [{ noteId: "local-only", kind: "questions", updatedAt: "2026-10-27T01:00:00.000Z" }],
    };
    const remote = {
      format: "river-backup",
      version: 2,
      notes: [
        { id: "shared", title: "remote newer", updatedAt: "2026-10-27T02:00:00.000Z" },
        { id: "remote-only", title: "another device note", updatedAt: "2026-10-27T03:00:00.000Z" },
      ],
      learningMaps: [{ noteId: "shared", kind: "requirements", updatedAt: "2026-10-27T02:00:00.000Z" }],
    };

    const merged = mergeWorkspacePayloads(local, remote);
    expect(merged.notes.map((note: any) => note.id).sort()).toEqual(["local-only", "remote-only", "shared"]);
    expect(merged.notes.find((note: any) => note.id === "shared").title).toBe("remote newer");
    expect(merged.learningMaps).toHaveLength(2);
  });
});
