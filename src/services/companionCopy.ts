import { nanoid } from "nanoid";
import type { ContentBlock, KnowledgeNode, LearningMap, LearningMapKind } from "../types";
import { nodesToTiptap } from "../editor/convert";

export const COMPANION_SECTION_TITLES: Record<LearningMapKind, string> = {
  requirements: "学习目标",
  questions: "导入问题",
};

function collectSubtree(nodes: KnowledgeNode[], rootId: string): Set<string> {
  const ids = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (node.parentId && ids.has(node.parentId) && !ids.has(node.id)) {
        ids.add(node.id);
        changed = true;
      }
    }
  }
  return ids;
}

/**
 * Copies the 学习目标 / 导入问题 section out of the main tree exactly once.
 * New node ids are assigned so the companion document never shares a mutable
 * identity with the main tree. Reference answers are stripped from the data
 * itself, not hidden with CSS.
 */
export function buildCompanionMap(
  nodes: KnowledgeNode[],
  blocks: ContentBlock[],
  noteId: string,
  kind: LearningMapKind,
  createdAt = new Date().toISOString(),
): LearningMap | null {
  const title = COMPANION_SECTION_TITLES[kind];
  const root = nodes.find((node) => node.parentId === null && node.title === title);
  if (!root) return null;
  const ids = collectSubtree(nodes, root.id);
  const sourceNodes = nodes.filter((node) => ids.has(node.id));
  const idMap = new Map<string, string>();
  sourceNodes.forEach((node) => idMap.set(node.id, nanoid()));

  const copiedNodes: KnowledgeNode[] = sourceNodes.map((node) => ({
    ...node,
    id: idMap.get(node.id) as string,
    parentId: node.parentId && idMap.has(node.parentId) ? (idMap.get(node.parentId) as string) : null,
    noteId,
    createdAt,
    updatedAt: createdAt,
  }));

  const copiedBlocks: ContentBlock[] = blocks
    .filter((block) => ids.has(block.nodeId) && block.type !== "referenceAnswer")
    .map((block) => ({
      ...block,
      id: nanoid(),
      nodeId: idMap.get(block.nodeId) as string,
      noteId,
      createdAt,
      updatedAt: createdAt,
    }));

  return {
    noteId,
    kind,
    editorDoc: nodesToTiptap(copiedNodes, copiedBlocks),
    nodes: copiedNodes,
    blocks: copiedBlocks,
    syncEnabled: false,
    revision: 1,
    createdAt,
    updatedAt: createdAt,
  };
}

export function buildCompanionMaps(
  nodes: KnowledgeNode[],
  blocks: ContentBlock[],
  noteId: string,
  createdAt = new Date().toISOString(),
) {
  return {
    requirements: buildCompanionMap(nodes, blocks, noteId, "requirements", createdAt),
    questions: buildCompanionMap(nodes, blocks, noteId, "questions", createdAt),
  };
}
