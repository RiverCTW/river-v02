import { describe, expect, it } from "vitest";
import type { ContentBlock, KnowledgeNode, LearningIntroduction, Note, NoteBundle } from "../src/types";
import { composeLearningOpeningOutline } from "../src/services/learningOpeningOutline";

const note: Note = {
  id: "note-1",
  folderId: null,
  title: "第15章 筹集资本",
  uiStyle: "effie",
  createdAt: "2026-10-17T00:00:00.000Z",
  updatedAt: "2026-10-17T00:00:00.000Z",
  deletedAt: null,
};

const introduction: LearningIntroduction = {
  noteId: note.id,
  mapSections: [
    { id: "s1", title: "章节导入", role: "intro", startPage: 1, endPage: 3, summary: "说明本章范围和定位。" },
    { id: "s2", title: "风险投资", role: "key", startPage: 4, endPage: 6, summary: "理解风险投资与众筹。" },
    { id: "s3", title: "IPO 抑价", role: "difficulty", startPage: 18, endPage: 23, summary: "理解赢家的诅咒。" },
  ],
  goals: ["理解风险投资", "掌握 IPO 抑价"],
  goalQuestions: ["风险投资如何退出？", "IPO 为什么会抑价？"],
  positioning: "本章位于公司金融融资决策部分。",
  prerequisiteNotes: ["理解财务报表。", "理解 NPV。"],
  generatedAt: "2026-10-17T00:00:00.000Z",
  userModified: false,
};

const aiNode: KnowledgeNode = {
  id: "ai-node",
  noteId: note.id,
  parentId: null,
  order: 0,
  title: "风险投资",
  nodeType: "chapter",
  headingLevel: 1,
  collapsed: false,
  sourceRefs: [],
  userModified: false,
  createdAt: "2026-10-17T00:00:00.000Z",
  updatedAt: "2026-10-17T00:00:00.000Z",
};

const aiBlock: ContentBlock = {
  id: "ai-block",
  noteId: note.id,
  nodeId: aiNode.id,
  order: 0,
  type: "explanation",
  text: "风险投资内容",
  sourceRefs: [],
  userModified: false,
  createdAt: "2026-10-17T00:00:00.000Z",
  updatedAt: "2026-10-17T00:00:00.000Z",
};

function bundle(nodes: KnowledgeNode[], blocks: ContentBlock[]): Pick<NoteBundle, "note" | "nodes" | "blocks"> {
  return { note, nodes, blocks };
}

describe("learning opening outline", () => {
  it("materializes the complete opening sequence before the AI knowledge tree", () => {
    const result = composeLearningOpeningOutline(bundle([aiNode], [aiBlock]), introduction, "2026-10-17T01:00:00.000Z", {
      nodes: [aiNode],
      blocks: [aiBlock],
    });

    expect(result.nodes.map((node) => node.title)).toEqual([
      "章节导入",
      "本章重点、难点与学习推进",
      "前置提示",
      "章节大纲",
      "本章目录",
      "导入问题",
      "风险投资",
    ]);
    expect(result.nodes.slice(0, 6).map((node) => node.order)).toEqual([-6, -5, -4, -3, -2, -1]);
    expect(result.blocks.some((block) => block.text.includes("本章在课程中的定位"))).toBe(true);
    expect(result.blocks.some((block) => block.text.includes("Q2. IPO 为什么会抑价？"))).toBe(true);
    expect(result.blocks.some((block) => block.text === "风险投资内容")).toBe(true);
  });

  it("preserves a user-modified opening node and its blocks", () => {
    const editedOpening: KnowledgeNode = {
      ...aiNode,
      id: "edited-opening",
      order: -2,
      title: "我修改过的本章目录",
      sourceRefs: [{ sourceId: "river:learning-opening", quote: "chapter-contents" }],
      userModified: true,
    };
    const editedBlock: ContentBlock = {
      ...aiBlock,
      id: "edited-block",
      nodeId: editedOpening.id,
      text: "用户自己修改的目录内容",
      userModified: true,
    };

    const result = composeLearningOpeningOutline(bundle([editedOpening, aiNode], [editedBlock, aiBlock]), introduction, "2026-10-17T01:00:00.000Z", {
      nodes: [aiNode],
      blocks: [aiBlock],
    });

    expect(result.nodes.some((node) => node.id === editedOpening.id)).toBe(true);
    expect(result.blocks.some((block) => block.id === editedBlock.id)).toBe(true);
    expect(result.nodes.filter((node) => node.title === "本章目录")).toHaveLength(0);
  });
});
