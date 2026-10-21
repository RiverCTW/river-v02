import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/db/database";
import { createBackupPayload, restoreBackupPayload } from "../src/db/backup";

beforeEach(async () => {
  await db.open();
  await db.transaction("rw", [db.folders, db.notes, db.sources, db.profiles, db.introductions, db.nodes, db.blocks, db.settings, db.learningMaps, db.chatMessages], async () => {
    await Promise.all([
      db.folders.clear(),
      db.notes.clear(),
      db.sources.clear(),
      db.profiles.clear(),
      db.introductions.clear(),
      db.nodes.clear(),
      db.blocks.clear(),
      db.settings.clear(),
      db.learningMaps.clear(),
      db.chatMessages.clear(),
    ]);
  });
});

describe("River backup round-trip", () => {
  it("preserves editor hierarchy metadata and semantic block content", async () => {
    const createdAt = "2026-10-14T10:00:00.000Z";
    const updatedAt = "2026-10-14T11:00:00.000Z";
    await db.notes.add({ id: "note-1", folderId: null, title: "测试笔记", uiStyle: "effie", createdAt, updatedAt, deletedAt: null });
    await db.nodes.add({
      id: "node-1",
      noteId: "note-1",
      parentId: null,
      order: 0,
      title: "生命周期评估",
      nodeType: "root",
      headingLevel: 1,
      collapsed: false,
      sourceRefs: [{ sourceId: "source-1", slideNumber: 1 }],
      userModified: true,
      createdAt,
      updatedAt,
    });
    await db.blocks.add({
      id: "block-1",
      nodeId: "node-1",
      noteId: "note-1",
      order: 0,
      type: "definition",
      text: "**LCA** 与 ++全生命周期++ 相关。",
      sourceRefs: [{ sourceId: "source-1", slideNumber: 2 }],
      userModified: true,
      createdAt,
      updatedAt,
    });
    await db.learningMaps.add({
      noteId: "note-1",
      kind: "questions",
      editorDoc: { type: "doc", content: [] },
      nodes: [],
      blocks: [],
      syncEnabled: false,
      revision: 1,
      createdAt,
      updatedAt,
    });
    await db.chatMessages.add({ id: "chat-1", noteId: "note-1", role: "user", content: "测试问题", mode: "sources", status: "success", createdAt });

    const backup = await createBackupPayload();
    await db.nodes.clear();
    await restoreBackupPayload(backup);

    await expect(db.nodes.get("node-1")).resolves.toMatchObject({
      title: "生命周期评估",
      headingLevel: 1,
      sourceRefs: [{ sourceId: "source-1", slideNumber: 1 }],
      createdAt,
      updatedAt,
    });
    await expect(db.blocks.get("block-1")).resolves.toMatchObject({
      type: "definition",
      text: "**LCA** 与 ++全生命周期++ 相关。",
      sourceRefs: [{ sourceId: "source-1", slideNumber: 2 }],
    });
    await expect(db.learningMaps.get(["note-1", "questions"])).resolves.toMatchObject({ syncEnabled: false, revision: 1 });
    await expect(db.chatMessages.get("chat-1")).resolves.toMatchObject({ content: "测试问题", role: "user" });
  });
});
