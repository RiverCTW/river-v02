import { nanoid } from "nanoid";
import type {
  ContentBlock,
  ContentBlockType,
  KnowledgeNode,
  LearningCluster,
  LearningGoalItem,
  LearningIntroduction,
  LearningMapSection,
  LearningQuestionItem,
  NoteBundle,
  SourceReference,
} from "../types";

const OPENING_SOURCE_ID = "river:learning-opening";

const openingDefinitions = [
  { key: "chapter-import", title: "章节导入" },
  { key: "focus-and-progress", title: "本章重点、难点与学习推进" },
  { key: "prerequisites", title: "前置提示" },
  { key: "chapter-outline", title: "章节大纲" },
  { key: "chapter-contents", title: "本章目录" },
  { key: "entry-questions", title: "导入问题" },
] as const;

const v022SectionKeys = [
  { key: "chapter-import-v022", title: "章节导入" },
  { key: "chapter-contains-v022", title: "本章包含" },
  { key: "all-tips-v022", title: "所有前置 tips" },
  { key: "chapter-directory-v022", title: "本章目录" },
  { key: "learning-goals-v022", title: "学习目标" },
  { key: "intro-questions-v022", title: "导入问题" },
] as const;

export const V022_OPENING_TITLES = v022SectionKeys.map((item) => item.title);
const v022KeyByTitle = new Map<string, string>(v022SectionKeys.map((item) => [item.title as string, item.key as string]));

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

function isV022OpeningNode(node: KnowledgeNode): boolean {
  if (node.parentId !== null) return false;
  if (V022_OPENING_TITLES.includes(node.title as (typeof V022_OPENING_TITLES)[number])) return true;
  const marker = node.sourceRefs.find((reference) => reference.sourceId === OPENING_SOURCE_ID)?.quote;
  return Boolean(marker && marker.endsWith("-v022"));
}

/** Legacy v0.2 opening: kept verbatim so historical notes still render. */
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
  addBlock(focusAndProgress, focusSections.length, "understanding", `学习推进建议：先建立整体框架，再依次理解 ${progression}。`);

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

/**
 * v0.22 opening: six fixed sections. Learning goals and intro questions are
 * real knowledge nodes so users can attach their own notes underneath.
 */
function buildV022Opening(
  noteId: string,
  introduction: LearningIntroduction,
  createdAt: string,
) {
  const nodes: KnowledgeNode[] = [];
  const blocks: ContentBlock[] = [];
  let topIndex = 0;

  const addNode = (options: {
    title: string;
    parentId: string | null;
    order: number;
    headingLevel: 1 | 2 | 3;
    nodeType?: KnowledgeNode["nodeType"];
    key?: string;
    sourceRefs?: SourceReference[];
    clusterId?: string | null;
    uncertaintyReason?: string;
    evidenceReason?: string;
  }) => {
    const node: KnowledgeNode = {
      id: nanoid(),
      noteId,
      parentId: options.parentId,
      order: options.order,
      title: options.title,
      nodeType: options.nodeType || "knowledge",
      headingLevel: options.headingLevel,
      collapsed: false,
      sourceRefs: options.sourceRefs || (options.key ? [{ sourceId: OPENING_SOURCE_ID, quote: options.key }] : []),
      userModified: false,
      clusterId: options.clusterId ?? null,
      uncertaintyReason: options.uncertaintyReason,
      evidenceReason: options.evidenceReason,
      createdAt,
      updatedAt: createdAt,
    };
    nodes.push(node);
    return node;
  };

  const addBlock = (
    node: KnowledgeNode,
    order: number,
    type: ContentBlockType,
    text: string,
    options: { collapsed?: boolean; sourceRefs?: SourceReference[] } = {},
  ) => {
    const block: ContentBlock = {
      id: nanoid(),
      nodeId: node.id,
      noteId,
      order,
      type,
      text,
      sourceRefs: options.sourceRefs || [],
      userModified: false,
      collapsed: options.collapsed,
      createdAt,
      updatedAt: createdAt,
    };
    blocks.push(block);
    return block;
  };

  const clusters: LearningCluster[] = introduction.clusters || [];
  const goalItems: LearningGoalItem[] = introduction.goalItems || [];
  const questionItems: LearningQuestionItem[] = introduction.questionItems || [];
  const learningPath = introduction.learningPath || [];
  const directory = (introduction as any).directory || [];

  // 1. 章节导入
  const importNode = addNode({ title: "章节导入", parentId: null, order: topIndex++ - 6, headingLevel: 1, nodeType: "chapter", key: "chapter-import-v022" });
  const positioningNode = addNode({ title: "本章的定位（意义）", parentId: importNode.id, order: 0, headingLevel: 2 });
  addBlock(positioningNode, 0, "explanation", introduction.positioning);
  const pathNode = addNode({ title: "本章学习路径", parentId: importNode.id, order: 1, headingLevel: 2 });
  (learningPath.length ? learningPath : introduction.mapSections.slice(0, 6).map((section) => ({ title: section.title, detail: section.summary }))).forEach((step, index) => {
    const stepNode = addNode({ title: step.title, parentId: pathNode.id, order: index, headingLevel: 3 });
    addBlock(stepNode, 0, "supplement", step.detail);
  });

  // 2. 本章包含（簇级原文，后续目标与问题共用同一份列表）
  const containsNode = addNode({ title: "本章包含", parentId: null, order: topIndex++ - 6, headingLevel: 1, nodeType: "chapter", key: "chapter-contains-v022" });
  clusters.forEach((cluster, index) => addBlock(containsNode, index, "supplement", cluster.title));

  // 3. 所有前置 tips（整章级提示）
  const tipsNode = addNode({ title: "所有前置 tips", parentId: null, order: topIndex++ - 6, headingLevel: 1, nodeType: "chapter", key: "all-tips-v022" });
  (introduction.prerequisiteNotes || []).forEach((tip, index) => addBlock(tipsNode, index, "supplement", tip));

  // 4. 本章目录（全量详表，页码集中在这里）
  const directoryNode = addNode({ title: "本章目录", parentId: null, order: topIndex++ - 6, headingLevel: 1, nodeType: "chapter", key: "chapter-directory-v022" });
  directory.forEach((entry: any, index: number) => {
    const range = entry.startPage
      ? entry.endPage && entry.endPage !== entry.startPage ? `P${entry.startPage}-${entry.endPage}` : `P${entry.startPage}`
      : entry.startSlide
        ? entry.endSlide && entry.endSlide !== entry.startSlide ? `Slide ${entry.startSlide}-${entry.endSlide}` : `Slide ${entry.startSlide}`
        : "";
    const role = roleLabels[entry.role as LearningMapSection["role"]] || "内容";
    const sectionNode = addNode({
      title: `【${role}${range ? ` · ${range}` : ""}】${entry.title}`,
      parentId: directoryNode.id,
      order: index,
      headingLevel: 2,
      nodeType: "topic",
    });
    (entry.blocks || []).forEach((block: any, blockIndex: number) => {
      const type = block.type === "referenceAnswer" ? "supplement" : block.type;
      addBlock(sectionNode, blockIndex, type, block.text, { sourceRefs: block.sourceRefs });
    });
    (entry.subsections || []).forEach((subsection: any, subIndex: number) => {
      const subNode = addNode({
        title: subsection.title,
        parentId: sectionNode.id,
        order: (entry.blocks || []).length + subIndex,
        headingLevel: 3,
      });
      (subsection.blocks || []).forEach((block: any, blockIndex: number) => {
        const type = block.type === "referenceAnswer" ? "supplement" : block.type;
        addBlock(subNode, blockIndex, type, block.text, { sourceRefs: block.sourceRefs });
      });
    });
  });

  // 5. 学习目标（章级总目标与簇平级；目标本身是节点，可挂用户收获）
  const goalsNode = addNode({ title: "学习目标", parentId: null, order: topIndex++ - 6, headingLevel: 1, nodeType: "chapter", key: "learning-goals-v022" });
  const chapterGoal = introduction.chapterGoal;
  if (chapterGoal?.text) {
    addNode({
      title: chapterGoal.text,
      parentId: goalsNode.id,
      order: 0,
      headingLevel: 2,
      uncertaintyReason: chapterGoal.uncertaintyReason,
      evidenceReason: chapterGoal.evidence?.reason,
      sourceRefs: chapterGoal.evidence?.sourceRefs,
    });
  }
  clusters.forEach((cluster, index) => {
    const clusterNode = addNode({ title: cluster.title, parentId: goalsNode.id, order: index + 1, headingLevel: 2, clusterId: cluster.id });
    const clusterGoals = goalItems.filter((goal) => goal.clusterId === cluster.id);
    if (!clusterGoals.length) {
      addBlock(clusterNode, 0, "placeholder", "本簇暂无学习目标");
    }
    clusterGoals.forEach((goal, goalIndex) => {
      addNode({
        title: goal.text,
        parentId: clusterNode.id,
        order: goalIndex,
        headingLevel: 3,
        clusterId: cluster.id,
        uncertaintyReason: goal.uncertaintyReason,
        evidenceReason: goal.evidence?.reason,
        sourceRefs: goal.evidence?.sourceRefs,
      });
    });
  });

  // 6. 导入问题（参考答案只在主树，默认折叠，和用户回答分离）
  const questionsNode = addNode({ title: "导入问题", parentId: null, order: topIndex++ - 6, headingLevel: 1, nodeType: "chapter", key: "intro-questions-v022" });
  const chapterQuestion = introduction.chapterQuestion;
  if (chapterQuestion?.text) {
    const chapterQuestionNode = addNode({ title: chapterQuestion.text, parentId: questionsNode.id, order: 0, headingLevel: 2 });
    if (chapterQuestion.referenceAnswer) {
      addBlock(chapterQuestionNode, 0, "referenceAnswer", chapterQuestion.referenceAnswer, { collapsed: true });
    }
  }
  clusters.forEach((cluster, index) => {
    const clusterNode = addNode({ title: cluster.title, parentId: questionsNode.id, order: index + 1, headingLevel: 2, clusterId: cluster.id });
    const clusterQuestions = questionItems.filter((question) => question.clusterId === cluster.id);
    if (!clusterQuestions.length) {
      addBlock(clusterNode, 0, "placeholder", "本簇暂无导入问题");
    }
    clusterQuestions.forEach((question, questionIndex) => {
      const questionNode = addNode({ title: question.text, parentId: clusterNode.id, order: questionIndex, headingLevel: 3, clusterId: cluster.id });
      if (question.referenceAnswer) {
        addBlock(questionNode, 0, "referenceAnswer", question.referenceAnswer, { collapsed: true });
      }
    });
  });

  return { nodes, blocks };
}

export function composeLearningOpeningOutline(
  bundle: Pick<NoteBundle, "note" | "nodes" | "blocks">,
  introduction: LearningIntroduction,
  createdAt = new Date().toISOString(),
  baseTree?: { nodes: KnowledgeNode[]; blocks: ContentBlock[] },
) {
  const isV022 = Boolean(introduction.clusters?.length && introduction.goalItems);
  const generated = isV022
    ? buildV022Opening(bundle.note.id, introduction, createdAt)
    : buildOpeningOutline(bundle.note.id, introduction, createdAt);

  const existingOpeningNodes = bundle.nodes.filter(isV022 ? isV022OpeningNode : isOpeningNode);
  const preservedNodes = existingOpeningNodes.filter((node) => node.userModified);
  const preservedIds = new Set(preservedNodes.map((node) => node.id));
  const preservedKeys = new Set(preservedNodes.map((node) => (isV022 ? v022KeyByTitle.get(node.title) || node.title : openingKey(node) || "")));
  const generatedNodes = generated.nodes.filter((node) => {
    if (node.parentId !== null) return true;
    const key = isV022 ? v022KeyByTitle.get(node.title) || node.title : openingKey(node) || "";
    return !preservedKeys.has(key);
  });
  const generatedIds = new Set(generatedNodes.map((node) => node.id));
  const existingOpeningIds = new Set(existingOpeningNodes.map((node) => node.id));
  const baseNodes = baseTree?.nodes ?? bundle.nodes;
  const baseBlocks = baseTree?.blocks ?? bundle.blocks;
  const remainingNodes = baseNodes.filter((node) => !existingOpeningIds.has(node.id) && !generatedIds.has(node.id));
  const remainingBlocks = baseBlocks.filter((block) => !existingOpeningIds.has(block.nodeId));
  const preservedBlocks = bundle.blocks.filter((block) => preservedIds.has(block.nodeId));
  const sectionKeyOrder = new Map<string, number>(
    (isV022 ? v022SectionKeys : openingDefinitions).map((definition, index) => [String(definition.title), index]),
  );
  const mergedOpening = [...preservedNodes, ...generatedNodes];
  const openingNodes = mergedOpening.map((node) => {
    if (node.parentId !== null) return node;
    const sectionIndex = sectionKeyOrder.get(node.title) ?? 0;
    return { ...node, parentId: null, order: sectionIndex - 6, nodeType: "chapter" as const };
  });
  const openingNodeIds = new Set(mergedOpening.map((node) => node.id));
  const openingBlocks = [...preservedBlocks, ...generated.blocks.filter((block) => !preservedIds.has(block.nodeId) && openingNodeIds.has(block.nodeId))];

  return {
    nodes: [...openingNodes, ...remainingNodes],
    blocks: [...openingBlocks, ...remainingBlocks],
  };
}
