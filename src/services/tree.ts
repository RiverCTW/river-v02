import { nanoid } from "nanoid";
import type { ContentBlock, KnowledgeNode } from "../types";

export interface TreeNode extends KnowledgeNode {
  children: TreeNode[];
  blocks: ContentBlock[];
}

export function buildTree(nodes: KnowledgeNode[], blocks: ContentBlock[]): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>();
  nodes.forEach((node) => {
    nodeMap.set(node.id, { ...node, children: [], blocks: [] });
  });
  blocks.forEach((block) => {
    const node = nodeMap.get(block.nodeId);
    if (node) node.blocks.push(block);
  });
  const roots: TreeNode[] = [];
  nodeMap.forEach((node) => {
    if (node.parentId && nodeMap.has(node.parentId)) {
      nodeMap.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  const sortNode = (node: TreeNode) => {
    node.children.sort((a, b) => a.order - b.order);
    node.blocks.sort((a, b) => a.order - b.order);
    node.children.forEach(sortNode);
  };
  roots.sort((a, b) => a.order - b.order);
  roots.forEach(sortNode);
  return roots;
}

export function flattenTree(roots: TreeNode[]): { nodes: KnowledgeNode[]; blocks: ContentBlock[] } {
  const nodes: KnowledgeNode[] = [];
  const blocks: ContentBlock[] = [];
  const walk = (node: TreeNode) => {
    const { children, blocks: nodeBlocks, ...rest } = node;
    nodes.push({ ...rest, order: rest.order });
    nodeBlocks.forEach((block, index) => {
      blocks.push({ ...block, order: index });
    });
    children.forEach((child, index) => {
      child.parentId = node.id;
      child.order = index;
      walk(child);
    });
  };
  roots.forEach((root, index) => {
    root.order = index;
    walk(root);
  });
  return { nodes, blocks };
}

export function addNodeAfter(nodes: KnowledgeNode[], blocks: ContentBlock[], targetId: string): { node: KnowledgeNode; block: ContentBlock } {
  const target = nodes.find((node) => node.id === targetId);
  const createdAt = new Date().toISOString();
  const node: KnowledgeNode = {
    id: nanoid(),
    noteId: target?.noteId || "",
    parentId: target?.parentId ?? null,
    order: (target?.order ?? 0) + 1,
    title: "新建知识点",
    nodeType: "knowledge",
    collapsed: false,
    sourceRefs: [],
    userModified: true,
    createdAt,
    updatedAt: createdAt,
  };
  const block: ContentBlock = {
    id: nanoid(),
    nodeId: node.id,
    noteId: node.noteId,
    order: 0,
    type: "explanation",
    text: "",
    sourceRefs: [],
    userModified: true,
    createdAt,
    updatedAt: createdAt,
  };
  return { node, block };
}

export function addChildNode(nodes: KnowledgeNode[], blocks: ContentBlock[], parentId: string): { node: KnowledgeNode; block: ContentBlock } {
  const parent = nodes.find((node) => node.id === parentId);
  const createdAt = new Date().toISOString();
  const siblings = nodes.filter((node) => node.parentId === parentId);
  const node: KnowledgeNode = {
    id: nanoid(),
    noteId: parent?.noteId || "",
    parentId,
    order: siblings.length,
    title: "新建子知识点",
    nodeType: "knowledge",
    collapsed: false,
    sourceRefs: [],
    userModified: true,
    createdAt,
    updatedAt: createdAt,
  };
  const block: ContentBlock = {
    id: nanoid(),
    nodeId: node.id,
    noteId: node.noteId,
    order: 0,
    type: "explanation",
    text: "",
    sourceRefs: [],
    userModified: true,
    createdAt,
    updatedAt: createdAt,
  };
  return { node, block };
}

export function indentNode(nodes: KnowledgeNode[], nodeId: string): KnowledgeNode[] {
  const node = nodes.find((item) => item.id === nodeId);
  if (!node) return nodes;
  const siblings = nodes
    .filter((item) => item.parentId === node.parentId)
    .sort((a, b) => a.order - b.order);
  const index = siblings.findIndex((item) => item.id === node.id);
  if (index <= 0) return nodes;
  const previous = siblings[index - 1];
  return nodes.map((item) =>
    item.id === node.id
      ? { ...item, parentId: previous.id, order: nodes.filter((n) => n.parentId === previous.id).length, updatedAt: new Date().toISOString(), userModified: true }
      : item,
  );
}

export function outdentNode(nodes: KnowledgeNode[], nodeId: string): KnowledgeNode[] {
  const node = nodes.find((item) => item.id === nodeId);
  if (!node || !node.parentId) return nodes;
  const parent = nodes.find((item) => item.id === node.parentId);
  if (!parent) return nodes;
  const parentSiblings = nodes.filter((item) => item.parentId === parent.parentId).sort((a, b) => a.order - b.order);
  const parentIndex = parentSiblings.findIndex((item) => item.id === parent.id);
  return nodes.map((item) =>
    item.id === node.id
      ? { ...item, parentId: parent.parentId, order: parentIndex + 1, updatedAt: new Date().toISOString(), userModified: true }
      : item,
  );
}

export function moveNode(nodes: KnowledgeNode[], nodeId: string, direction: -1 | 1): KnowledgeNode[] {
  const node = nodes.find((item) => item.id === nodeId);
  if (!node) return nodes;
  const siblings = nodes.filter((item) => item.parentId === node.parentId).sort((a, b) => a.order - b.order);
  const index = siblings.findIndex((item) => item.id === node.id);
  const swapIndex = index + direction;
  if (swapIndex < 0 || swapIndex >= siblings.length) return nodes;
  const other = siblings[swapIndex];
  return nodes.map((item) => {
    if (item.id === node.id) return { ...item, order: other.order, updatedAt: new Date().toISOString() };
    if (item.id === other.id) return { ...item, order: node.order, updatedAt: new Date().toISOString() };
    return item;
  });
}

export function deleteNode(nodes: KnowledgeNode[], blocks: ContentBlock[], nodeId: string): { nodes: KnowledgeNode[]; blocks: ContentBlock[]; deletedIds: string[] } {
  const deleteIds = new Set<string>();
  const collect = (id: string) => {
    deleteIds.add(id);
    nodes.filter((node) => node.parentId === id).forEach((node) => collect(node.id));
  };
  collect(nodeId);
  return {
    nodes: nodes.filter((node) => !deleteIds.has(node.id)),
    blocks: blocks.filter((block) => !deleteIds.has(block.nodeId)),
    deletedIds: [...deleteIds],
  };
}

export function countNodes(nodes: KnowledgeNode[]): number {
  return nodes.length;
}
