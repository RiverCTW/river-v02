import { nanoid } from "nanoid";
import type { ContentBlock, ContentBlockType, KnowledgeNode, LearningIntroduction, LearningMapSection, NoteBundle } from "../types";

const OPENING_SOURCE_ID = "river:learning-opening";

const openingDefinitions = [
  { key: "chapter-import", title: "章节导入" },
  { key: "focus-and-progress", title: "本章重点、难点与学习推进" },
  { key: "prerequisites", title: "前置提示" },
  { key: "chapter-outline", title: "章节大纲" },
  { key: "chapter-contents", title: "本章目录" },
  { key: "entry-questions", title: "导入问题" },
] as const;

const openingOrder = new Map<string, number>(openingDefinitions.map((definition, index) => [definition.key, index]));
const openingTitles = new Set<string>(openingDefinitions.map((definition) => definition.title));

const roleLabels: Record<LearningMapSection["role"], string> = {
  intro: "引入",
  key: "重点",
  difficulty: "难点",
  exercise: "练习",
  extension: "拓展",
};

function rangeLabel(section: LearningMapSection): string {
  if (section.startPage) return section.endPage && section.endPage !== section.startPage ? `P${section.startPage}-${section.endPage}` : `P${section.startPage}`;
  if (section.startSlide) return section.endSlide && section.endSlide !== section.startSlide ? `Slide ${section.startSlide}-${section.endSlide}` : `Slide ${section.startSlide}`;
  return "";
}

function openingKey(node: KnowledgeNode): string | null {
  const marker = node.sourceRefs.find((reference) => reference.sourceId === OPENING_SOURCE_ID)?.quote;
  if (marker && openingOrder.has(marker)) return marker;
  const definition = openingDefinitions.find((item) => item.title === node.title);
  return definition?.key || null;
}

function isOpeningNode(node: KnowledgeNode): boolean {
  return node.parentId === null && (Boolean(openingKey(node)) || openingTitles.has(node.title));
}

function buildOpeningOutline(noteId: string, introduction: LearningIntroduction, createdAt: string) {
  const nodes: KnowledgeNode[] = [];
  const blocks: ContentBlock[] = [];

  const addNode = (key: string, title: string) => {
    const node: KnowledgeNode = {
      id: nanoid(),
      noteId,
      parentId: null,
      order: openingOrder.get(key) ?? nodes.length,
      title,
      nodeType: "chapter",
      headingLevel: 1,
      collapsed: false,
      sourceRefs: [{ sourceId: OPENING_SOURCE_ID, quote: key }],
      userModified: false,
      createdAt,
      updatedAt: createdAt,
    };
    nodes.push(node);
    return node;
  };

  const addBlock = (node: KnowledgeNode, index: number, type: ContentBlockType, text: string) => {
    blocks.push({
      id: nanoid(),
      nodeId: node.id,
      noteId,
      order: index,
      type,
      text,
      sourceRefs: [],
      userModified: false,
      createdAt,
      updatedAt: createdAt,
    });
  };

  const chapterImport = addNode("chapter-import", "章节导入");
  addBlock(chapterImport, 0, "explanation", `本章在课程中的定位：${introduction.positioning}`);
  addBlock(chapterImport, 1, "supplement", `本章包含：${introduction.mapSections.map((section) => section.title).join("；")}。`);

  const focusAndProgress = addNode("focus-and-progress", "本章重点、难点与学习推进");
  const focusSections = introduction.mapSections.filter((section) => section.role === "key" || section.role === "difficulty");
  (focusSections.length ? focusSections : introduction.mapSections).forEach((section, index) => {
    const range = rangeLabel(section);
    addBlock(focusAndProgress, index, section.role === "difficulty" ? "pitfall" : "supplement", `【${roleLabels[section.role]}${range ? ` · ${range}` : ""}】${section.title}：${section.summary}`);
  });
  const progression = introduction.mapSections.map((section) => section.title).slice(0, 8).join(" → ");
  addBlock(focusAndProgress, focusSections.length, "understanding", `学习推进建议：先建立整体框架，再依次理解 ${progression}。理解概念后再做配股、权利价值和稀释计算。`);

  const prerequisites = addNode("prerequisites", "前置提示");
  introduction.prerequisiteNotes.forEach((note, index) => addBlock(prerequisites, index, "supplement", note));

  const chapterOutline = addNode("chapter-outline", "章节大纲");
  introduction.goals.forEach((goal, index) => addBlock(chapterOutline, index, "understanding", `学习目标 ${index + 1}：${goal}`));

  const chapterContents = addNode("chapter-contents", "本章目录");
  introduction.mapSections.forEach((section, index) => {
    const range = rangeLabel(section);
    addBlock(chapterContents, index, "supplement", `[${roleLabels[section.role]}${range ? ` · ${range}` : ""}] ${section.title}\n${section.summary}`);
  });

  const entryQuestions = addNode("entry-questions", "导入问题");
  introduction.goalQuestions.forEach((question, index) => addBlock(entryQuestions, index, "understanding", `Q${index + 1}. ${question}`));

  return { nodes, blocks };
}

export function composeLearningOpeningOutline(
  bundle: Pick<NoteBundle, "note" | "nodes" | "blocks">,
  introduction: LearningIntroduction,
  createdAt = new Date().toISOString(),
  baseTree?: { nodes: KnowledgeNode[]; blocks: ContentBlock[] },
) {
  const generated = buildOpeningOutline(bundle.note.id, introduction, createdAt);
  const existingOpeningNodes = bundle.nodes.filter(isOpeningNode);
  const preservedNodes = existingOpeningNodes.filter((node) => node.userModified);
  const preservedIds = new Set(preservedNodes.map((node) => node.id));
  const preservedKeys = new Set(preservedNodes.map(openingKey).filter((key): key is string => Boolean(key)));
  const generatedNodes = generated.nodes.filter((node) => !preservedKeys.has(openingKey(node) || ""));
  const generatedIds = new Set(generatedNodes.map((node) => node.id));
  const existingOpeningIds = new Set(existingOpeningNodes.map((node) => node.id));
  const baseNodes = baseTree?.nodes ?? bundle.nodes;
  const baseBlocks = baseTree?.blocks ?? bundle.blocks;
  const remainingNodes = baseNodes.filter((node) => !existingOpeningIds.has(node.id) && !generatedIds.has(node.id));
  const remainingBlocks = baseBlocks.filter((block) => !existingOpeningIds.has(block.nodeId));
  const preservedBlocks = bundle.blocks.filter((block) => preservedIds.has(block.nodeId));
  const openingNodes = [...preservedNodes, ...generatedNodes]
    .sort((left, right) => (openingOrder.get(openingKey(left) || "") ?? 99) - (openingOrder.get(openingKey(right) || "") ?? 99))
    .map((node, index) => ({ ...node, parentId: null, order: index - openingDefinitions.length, nodeType: "chapter" as const }));

  return {
    nodes: [...openingNodes, ...remainingNodes],
    blocks: [...preservedBlocks, ...generated.blocks, ...remainingBlocks],
  };
}
