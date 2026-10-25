import { describe, expect, it } from "vitest";
import type { ContentBlock, KnowledgeNode, LearningIntroduction, Note } from "../src/types";
import { composeLearningOpeningOutline, V022_OPENING_TITLES } from "../src/services/learningOpeningOutline";
import { buildCompanionMaps } from "../src/services/companionCopy";
import { nodesToTiptap, tiptapToNodes } from "../src/editor/convert";
import { cleanText, normalizeBlock } from "../server/knowledgeTreeV022";

const note: Note = {
  id: "note-v022", folderId: null, title: "Chapter 2 合同法", uiStyle: "effie",
  createdAt: "2026-10-26T00:00:00.000Z", updatedAt: "2026-10-26T00:00:00.000Z",
};

const introduction: LearningIntroduction = {
  noteId: note.id,
  mapSections: [
    { id: "s1", title: "什么是合同", role: "intro", startSlide: 1, endSlide: 4, summary: "建立合同定义。" },
    { id: "s2", title: "合同类型", role: "key", startSlide: 5, endSlide: 8, summary: "简单合同与契据。" },
  ],
  goals: ["给定情境判断合同是否成立。"],
  goalQuestions: ["整章要解决什么问题？"],
  positioning: "本章为后续判断奠定基础。",
  prerequisiteNotes: ["无需先修法律课程。"],
  clusters: [
    { id: "c1", title: "课程地图与合同法的起点：什么是合同" },
    { id: "c2", title: "合同类型：简单合同与正式合同（契据）" },
    { id: "c3", title: "空簇示例" },
  ],
  learningPath: [
    { title: "建议先按第 1—4 节", detail: "建立合同定义、类型、形式、效力的底层概念。" },
    { title: "再进入第 5—8 节", detail: "进入合同成立主线。" },
  ],
  chapterGoal: { id: "g0", clusterId: null, text: "给定交易事实，能判断合同是否成立。", evidence: { sourceRefs: [], reason: "综合能力" } },
  goalItems: [
    { id: "g1", clusterId: "c1", text: "能解释合同定义中的三个关键词。", evidence: { sourceRefs: [], reason: "核心概念" } },
    { id: "g2", clusterId: "c2", text: "能比较简单合同与契据的差异。", evidence: { sourceRefs: [], reason: "重要对比" }, uncertaintyReason: "课件只简单提及。" },
  ],
  chapterQuestion: { id: "q0", clusterId: null, text: "整章要解决什么问题？", referenceAnswer: "判断合同是否成立及责任归属。" },
  questionItems: [
    { id: "q1", clusterId: "c1", text: "合同定义的关键词是什么？", referenceAnswer: "协议、拘束力、法律上。" },
  ],
  directory: [
    { sectionId: "s1", title: "什么是合同", role: "intro", startSlide: 1, endSlide: 4, blocks: [{ type: "explanation", text: "定义与三个关键词。", sourceRefs: [] }], subsections: [] },
    { sectionId: "s2", title: "合同类型", role: "key", startSlide: 5, endSlide: 8, blocks: [{ type: "explanation", text: "两类合同。", sourceRefs: [] }], subsections: [{ title: "简单合同与正式合同（契据）", blocks: [{ type: "example", text: "出租车许诺换许诺。", sourceRefs: [] }] }] },
  ] as any,
  generatedAt: "2026-10-26T00:00:00.000Z",
  userModified: false,
};

const bodyNode: KnowledgeNode = {
  id: "body-1", noteId: note.id, parentId: null, order: 0, title: "合同定义", nodeType: "chapter",
  headingLevel: 1, collapsed: false, sourceRefs: [], userModified: false,
  createdAt: "2026-10-26T00:00:00.000Z", updatedAt: "2026-10-26T00:00:00.000Z",
};
const bodyBlock: ContentBlock = {
  id: "body-b1", nodeId: "body-1", noteId: note.id, order: 0, type: "importantTips",
  text: "判断前先识别要约。", sourceRefs: [], userModified: false,
  createdAt: "2026-10-26T00:00:00.000Z", updatedAt: "2026-10-26T00:00:00.000Z",
};

function compose() {
  return composeLearningOpeningOutline(
    { note, nodes: [bodyNode], blocks: [bodyBlock] },
    introduction,
    "2026-10-26T01:00:00.000Z",
    { nodes: [bodyNode], blocks: [bodyBlock] },
  );
}

describe("River v0.22 knowledge tree opening", () => {
  it("emits the six fixed opening sections in order, before the body", () => {
    const result = compose();
    const top = result.nodes.filter((node) => node.parentId === null).sort((a, b) => a.order - b.order);
    expect(top.map((node) => node.title)).toEqual([...V022_OPENING_TITLES, "合同定义"]);
  });

  it("keeps 本章包含 cluster titles verbatim and reuses them in goals and questions", () => {
    const result = compose();
    const contains = result.nodes.find((node) => node.title === "本章包含")!;
    const containsBlocks = result.blocks.filter((block) => block.nodeId === contains.id).sort((a, b) => a.order - b.order);
    expect(containsBlocks.map((block) => block.text)).toEqual(introduction.clusters!.map((cluster) => cluster.title));
    const goalClusters = result.nodes.filter((node) => node.parentId === result.nodes.find((item) => item.title === "学习目标")!.id).map((node) => node.title);
    expect(goalClusters).toEqual([introduction.chapterGoal!.text, ...introduction.clusters!.map((cluster) => cluster.title)]);
  });

  it("makes the chapter goal a sibling of clusters, not their parent", () => {
    const result = compose();
    const goalsSection = result.nodes.find((node) => node.title === "学习目标")!;
    const chapterGoal = result.nodes.find((node) => node.title === introduction.chapterGoal!.text)!;
    const cluster = result.nodes.find((node) => node.title === introduction.clusters![0].title && node.parentId === goalsSection.id)!;
    expect(chapterGoal.parentId).toBe(goalsSection.id);
    expect(cluster.parentId).toBe(goalsSection.id);
    expect(result.nodes.some((node) => node.parentId === chapterGoal.id)).toBe(false);
  });

  it("shows an explicit placeholder for empty clusters", () => {
    const result = compose();
    const emptyCluster = result.nodes.find((node) => node.title === "空簇示例" && node.parentId !== null)!;
    const placeholder = result.blocks.find((block) => block.nodeId === emptyCluster.id && block.type === "placeholder");
    expect(placeholder?.text).toBe("本簇暂无学习目标");
  });

  it("stores reference answers as collapsed blocks in the main tree only", () => {
    const result = compose();
    const answers = result.blocks.filter((block) => block.type === "referenceAnswer");
    expect(answers.length).toBe(2);
    expect(answers.every((block) => block.collapsed === true)).toBe(true);
    const companion = buildCompanionMaps(result.nodes, result.blocks, note.id, "2026-10-26T02:00:00.000Z");
    expect(companion.questions).not.toBeNull();
    expect(companion.questions!.blocks.some((block) => block.type === "referenceAnswer")).toBe(false);
    expect(JSON.stringify(companion.questions)).not.toContain("协议、拘束力、法律上");
  });

  it("gives companion documents independent node ids", () => {
    const result = compose();
    const companion = buildCompanionMaps(result.nodes, result.blocks, note.id, "2026-10-26T02:00:00.000Z");
    const mainGoalIds = new Set(result.nodes.map((node) => node.id));
    const companionIds = companion.requirements!.nodes.map((node) => node.id);
    expect(companionIds.length).toBeGreaterThan(0);
    expect(companionIds.some((id) => mainGoalIds.has(id))).toBe(false);
  });

  it("round-trips importantTips and referenceAnswer through the editor document", () => {
    const result = compose();
    const doc = nodesToTiptap(result.nodes, result.blocks);
    const back = tiptapToNodes(doc, note.id);
    expect(back.blocks.some((block) => block.type === "importantTips")).toBe(true);
    const answer = back.blocks.find((block) => block.type === "referenceAnswer");
    expect(answer).toBeTruthy();
    expect(answer!.collapsed).toBe(true);
  });

  it("never leaves generated strikethrough or body-level reference answers", () => {
    expect(cleanText("正常内容 ~~删掉这句~~")).toBe("正常内容 删掉这句");
    const normalized = normalizeBlock({ type: "referenceAnswer", text: "答案", sourceRefs: [] });
    expect(normalized.type).toBe("supplement");
  });

  it("still renders legacy notes with the old six-section layout", () => {
    const legacy: LearningIntroduction = {
      ...introduction, clusters: undefined, goalItems: undefined, questionItems: undefined,
      chapterGoal: undefined, chapterQuestion: undefined, learningPath: undefined, directory: undefined,
    };
    const result = composeLearningOpeningOutline({ note, nodes: [bodyNode], blocks: [bodyBlock] }, legacy, "2026-10-26T01:00:00.000Z", { nodes: [bodyNode], blocks: [bodyBlock] });
    const top = result.nodes.filter((node) => node.parentId === null).sort((a, b) => a.order - b.order);
    expect(top.slice(0, 6).map((node) => node.title)).toEqual(["章节导入", "本章重点、难点与学习推进", "前置提示", "章节大纲", "本章目录", "导入问题"]);
  });
});
