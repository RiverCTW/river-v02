import { describe, expect, it } from "vitest";
import { applyDeletedNoteTombstones } from "../server/tombstones";

describe("server-side tombstone guard", () => {
  it("rejects stale notes and child records even when a client omits tombstones", () => {
    const previous = {
      notes: [{ id: "keep" }],
      sources: [],
      deletedNoteIds: ["gone"],
    };
    const staleClientPayload = {
      notes: [{ id: "keep" }, { id: "gone" }],
      sources: [{ id: "source-gone", noteId: "gone" }],
      profiles: [{ noteId: "gone" }],
      introductions: [{ noteId: "gone" }],
      nodes: [{ id: "node-gone", noteId: "gone" }],
      blocks: [{ id: "block-gone", noteId: "gone" }],
      learningMaps: [{ noteId: "gone", kind: "questions" }],
      chatMessages: [{ id: "chat-gone", noteId: "gone" }],
      deletedNoteIds: [],
    };

    const guarded = applyDeletedNoteTombstones(previous, staleClientPayload);
    expect(guarded.notes.map((note: any) => note.id)).toEqual(["keep"]);
    expect(guarded.sources).toHaveLength(0);
    expect(guarded.profiles).toHaveLength(0);
    expect(guarded.introductions).toHaveLength(0);
    expect(guarded.nodes).toHaveLength(0);
    expect(guarded.blocks).toHaveLength(0);
    expect(guarded.learningMaps).toHaveLength(0);
    expect(guarded.chatMessages).toHaveLength(0);
    expect(guarded.deletedNoteIds).toEqual(["gone"]);
  });
});
