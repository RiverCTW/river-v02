import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { NoteBundle } from "../src/types";
import { useAppStore } from "../src/store/useAppStore";

function bundleWithText(text: string): NoteBundle {
  const createdAt = "2026-10-17T00:00:00.000Z";
  return {
    note: {
      id: "note-conflict",
      folderId: null,
      title: "AI 冲突测试",
      uiStyle: "effie",
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
    },
    source: undefined,
    profile: undefined,
    introduction: undefined,
    nodes: [{
      id: "node-1",
      noteId: "note-conflict",
      parentId: null,
      order: 0,
      title: "目标节点",
      nodeType: "knowledge",
      collapsed: false,
      sourceRefs: [],
      userModified: true,
      createdAt,
      updatedAt: createdAt,
    }],
    blocks: [{
      id: "block-1",
      nodeId: "node-1",
      noteId: "note-conflict",
      order: 0,
      type: "explanation",
      text,
      sourceRefs: [],
      userModified: true,
      createdAt,
      updatedAt: createdAt,
    }],
  };
}

describe("AI conflict protection", () => {
  it("does not silently overwrite manual edits made while AI is pending", async () => {
    const original = "AI 返回前的内容";
    const manual = "用户在等待 AI 时写入的新内容";
    useAppStore.setState({
      bundle: bundleWithText(manual),
      pendingAI: {
        kind: "regenerate",
        nodeId: "node-1",
        blockId: "block-1",
        text: "AI 候选结果",
        baseText: original,
        requestedAt: "2026-10-17T00:01:00.000Z",
      },
    });

    await useAppStore.getState().applyPendingAI();

    const state = useAppStore.getState();
    expect(state.pendingAI?.conflict).toBe(true);
    expect(state.bundle?.blocks[0]?.text).toBe(manual);
    expect(state.bundle?.blocks[0]?.text).not.toBe("AI 候选结果");
  });
});
