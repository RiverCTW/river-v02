import { nanoid } from "nanoid";
import type {
  ContentBlock,
  ContentBlockType,
  EditorDocumentSnapshot,
  KnowledgeNode,
  ListType,
  NodeType,
  SourceReference,
} from "../types";

export type TiptapNode = EditorDocumentSnapshot;

const ROOT_LIST_TYPES = new Set(["bulletList", "orderedList"]);
const LEGACY_ROOT_TITLE = "旧版笔记内容";

const blockTypes: ContentBlockType[] = [
  "definition",
  "explanation",
  "example",
  "supplement",
  "formula",
  "understanding",
  "pitfall",
  "source",
  "quote",
  "comment",
  "annotation",
  "code",
  "divider",
];

function textContent(node?: TiptapNode): string {
  if (!node) return "";
  if (node.type === "text") return node.text || "";
  if (node.type === "hardBreak") return "\n";
  return (node.content || []).map(textContent).join("");
}

function paragraphs(text: string): TiptapNode[] {
  return text.split("\n").map((line) => ({
    type: "paragraph",
    content: line ? [{ type: "text", text: line }] : [],
  }));
}

function listItem(attrs: Record<string, unknown>, text: string, childLists: TiptapNode[] = []): TiptapNode {
  return {
    type: "listItem",
    attrs,
    content: [...paragraphs(text), ...childLists],
  };
}

function listTypeOf(node: TiptapNode): ListType {
  return node.type === "orderedList" ? "ordered" : "bullet";
}

function listNode(type: ListType, items: TiptapNode[]): TiptapNode {
  return {
    type: type === "ordered" ? "orderedList" : "bulletList",
    content: items,
  };
}

function isRootList(node: TiptapNode): boolean {
  return ROOT_LIST_TYPES.has(node.type) && Boolean(node.content?.length);
}

function isValidRootDocument(doc: TiptapNode): boolean {
  const rootContent = doc.content || [];
  return doc.type === "doc"
    && rootContent.length > 0
    && rootContent.every(isRootList);
}

function textblockContent(node: TiptapNode): TiptapNode[] {
  if (node.type === "paragraph" || node.type === "heading") {
    return [{
      type: "paragraph",
      attrs: node.attrs,
      content: node.content || [],
    }];
  }
  const nested = (node.content || []).flatMap(textblockContent);
  if (nested.length) return nested;
  const text = textContent(node);
  return [{
    type: "paragraph",
    content: text ? [{ type: "text", text }] : [],
  }];
}

/**
 * Older snapshots may contain block nodes directly under `doc`. The current
 * schema deliberately requires outline lists, so handing those snapshots to
 * ProseMirror can reject the whole document. Migrate those roots once into a
 * single, clearly labeled legacy container; this is deterministic (the caller
 * supplies a stable identity/time) and retains every text block.
 */
export function normalizeEditorDocument(
  doc: EditorDocumentSnapshot,
  options: { noteId: string; createdAt?: string },
): TiptapNode {
  const fallbackTime = options.createdAt || "1970-01-01T00:00:00.000Z";
  if (isValidRootDocument(doc)) return doc as TiptapNode;
  if (doc.type !== "doc" || !doc.content?.length) return emptyOutlineDocument(LEGACY_ROOT_TITLE);

  const nodes: TiptapNode[] = [];
  let legacyBlocks: TiptapNode[] = [];
  let legacyIndex = 0;

  const flushLegacyBlocks = () => {
    if (!legacyBlocks.length) return;
    nodes.push({
      type: "bulletList",
      content: [{
        type: "listItem",
        attrs: {
          itemType: "knowledge",
          nodeId: `legacy-root-${options.noteId}`,
          nodeType: "root",
          headingLevel: 1,
          listType: "bullet",
          sourceRefs: [],
          userModified: true,
          collapsed: false,
          createdAt: fallbackTime,
          updatedAt: fallbackTime,
        },
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: LEGACY_ROOT_TITLE }],
          },
          {
            type: "bulletList",
            content: legacyBlocks,
          },
        ],
      }],
    });
    legacyBlocks = [];
  };

  const rootContent = doc.content || [];
  rootContent.forEach((child) => {
    if (isRootList(child)) {
      flushLegacyBlocks();
      nodes.push(child);
      return;
    }
    const blockId = `legacy-block-${options.noteId}-${legacyIndex}`;
    legacyIndex += 1;
    legacyBlocks.push({
      type: "listItem",
      attrs: {
        itemType: "block",
        blockId,
        blockType: "explanation",
        headingLevel: 0,
        sourceRefs: [],
        userModified: true,
        collapsed: false,
        createdAt: fallbackTime,
        updatedAt: fallbackTime,
      },
      content: textblockContent(child),
    });
  });
  flushLegacyBlocks();

  return nodes.length ? { type: "doc", content: nodes } : emptyOutlineDocument(LEGACY_ROOT_TITLE);
}

function groupByListType<T extends { listType?: ListType }>(items: T[], build: (item: T) => TiptapNode): TiptapNode[] {
  const groups: TiptapNode[] = [];
  let currentType: ListType | null = null;
  let currentItems: TiptapNode[] = [];
  items.forEach((item) => {
    const type = item.listType === "ordered" ? "ordered" : "bullet";
    if (currentType && currentType !== type) {
      groups.push(listNode(currentType, currentItems));
      currentItems = [];
    }
    currentType = type;
    currentItems.push(build(item));
  });
  if (currentType && currentItems.length) groups.push(listNode(currentType, currentItems));
  return groups;
}

export function nodesToTiptap(nodes: KnowledgeNode[], blocks: ContentBlock[]): TiptapNode {
  const byParent = new Map<string | null, KnowledgeNode[]>();
  nodes.forEach((node) => {
    const list = byParent.get(node.parentId) || [];
    list.push(node);
    byParent.set(node.parentId, list);
  });
  byParent.forEach((list) => list.sort((a, b) => a.order - b.order));

  const blocksByNode = new Map<string, ContentBlock[]>();
  blocks.forEach((block) => {
    const list = blocksByNode.get(block.nodeId) || [];
    list.push(block);
    blocksByNode.set(block.nodeId, list);
  });
  blocksByNode.forEach((list) => list.sort((a, b) => a.order - b.order));

  const buildNode = (node: KnowledgeNode, depth: number): TiptapNode => {
    const blockLists = groupByListType(blocksByNode.get(node.id) || [], (block) => listItem(
      {
        itemType: "block",
        blockId: block.id,
        blockType: block.type,
        markerVisible: false,
        sourceRefs: block.sourceRefs,
        userModified: block.userModified,
        collapsed: false,
        createdAt: block.createdAt,
        updatedAt: block.updatedAt,
      },
      block.text,
    ));
    const childLists = groupByListType(byParent.get(node.id) || [], (child) => buildNode(child, depth + 1));
    const headingLevel = node.headingLevel ?? (depth === 0 ? 1 : depth === 1 ? 2 : 0);
    return listItem(
      {
        itemType: "knowledge",
        nodeId: node.id,
        nodeType: node.nodeType,
        headingLevel,
        markerVisible: headingLevel === 0,
        sourceRefs: node.sourceRefs,
        userModified: node.userModified,
        collapsed: node.collapsed,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
      },
      node.title,
      [...blockLists, ...childLists],
    );
  };

  const rootLists = groupByListType(byParent.get(null) || [], (node) => buildNode(node, 0));
  return { type: "doc", content: rootLists };
}

export function tiptapToNodes(doc: TiptapNode, noteId: string): { nodes: KnowledgeNode[]; blocks: ContentBlock[] } {
  const now = new Date().toISOString();
  const nodes: KnowledgeNode[] = [];
  const blocks: ContentBlock[] = [];
  const knowledgeOrders = new Map<string | null, number>();
  const blockOrders = new Map<string, number>();

  const nextKnowledgeOrder = (parentId: string | null) => {
    const order = knowledgeOrders.get(parentId) ?? 0;
    knowledgeOrders.set(parentId, order + 1);
    return order;
  };

  const nextBlockOrder = (nodeId: string) => {
    const order = blockOrders.get(nodeId) ?? 0;
    blockOrders.set(nodeId, order + 1);
    return order;
  };

  const walkList = (list: TiptapNode | undefined, parentKnowledgeId: string | null) => {
    if (!list?.content?.length) return;
    const listType = listTypeOf(list);

    list.content.forEach((item) => {
      if (item.type !== "listItem") return;
      const attrs = item.attrs || {};
      const directParagraphs = (item.content || []).filter((child) => child.type === "paragraph");
      const title = directParagraphs.map((child) => textContent(child)).join("\n");
      const nestedLists = (item.content || []).filter((child) => child.type === "bulletList" || child.type === "orderedList");
      const itemType = attrs.itemType === "block" ? "block" : "knowledge";

      if (itemType === "block") {
        const nodeId = parentKnowledgeId || nanoid();
        if (!parentKnowledgeId) {
          nodes.push({
            id: nodeId,
            noteId,
            parentId: null,
            order: nextKnowledgeOrder(null),
            title: title || "未命名知识点",
            nodeType: "knowledge",
            headingLevel: 0,
            listType,
            collapsed: false,
            sourceRefs: [],
            userModified: true,
            createdAt: now,
            updatedAt: now,
          });
        }
        blocks.push({
          id: String(attrs.blockId || nanoid()),
          nodeId,
          noteId,
          order: nextBlockOrder(nodeId),
          type: (blockTypes.includes(attrs.blockType as ContentBlockType) ? attrs.blockType : "explanation") as ContentBlockType,
          text: title,
          listType,
          sourceRefs: (attrs.sourceRefs as SourceReference[]) || [],
          userModified: Boolean(attrs.userModified),
          createdAt: String(attrs.createdAt || now),
          updatedAt: String(attrs.updatedAt || now),
        });
        nestedLists.forEach((nested) => walkList(nested, nodeId));
      } else {
        const nodeId = String(attrs.nodeId || nanoid());
        nodes.push({
          id: nodeId,
          noteId,
          parentId: parentKnowledgeId,
          order: nextKnowledgeOrder(parentKnowledgeId),
          title: title || "未命名知识点",
          nodeType: (attrs.nodeType as NodeType) || "knowledge",
          headingLevel: (attrs.headingLevel as KnowledgeNode["headingLevel"]) ?? 0,
          listType,
          collapsed: Boolean(attrs.collapsed),
          sourceRefs: (attrs.sourceRefs as SourceReference[]) || [],
          userModified: Boolean(attrs.userModified),
          createdAt: String(attrs.createdAt || now),
          updatedAt: String(attrs.updatedAt || now),
        });
        nestedLists.forEach((nested) => walkList(nested, nodeId));
      }
    });
  };

  (doc.content || []).forEach((node, index) => {
    if (node.type === "bulletList" || node.type === "orderedList") {
      walkList(node, null);
      return;
    }
    // A top-level paragraph is not a knowledge node. The complete editor
    // snapshot remains authoritative and prevents an invalid root from being
    // silently turned into extra outline data.
    void index;
  });

  return { nodes, blocks };
}

export function emptyOutlineDocument(title = "新建笔记"): TiptapNode {
  const now = new Date().toISOString();
  return {
    type: "doc",
    content: [
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            attrs: {
              itemType: "knowledge",
              nodeId: nanoid(),
              nodeType: "knowledge",
              headingLevel: 1,
              listType: "bullet",
              sourceRefs: [],
              userModified: true,
              collapsed: false,
              markerVisible: false,
              createdAt: now,
              updatedAt: now,
            },
            content: [
              ...paragraphs(title),
              {
                type: "bulletList",
                content: [
                  {
                    type: "listItem",
                    attrs: {
                      itemType: "block",
                      blockId: nanoid(),
                      blockType: "explanation",
                      sourceRefs: [],
                      userModified: true,
                      collapsed: false,
                      markerVisible: false,
                      createdAt: now,
                      updatedAt: now,
                    },
                    content: paragraphs(""),
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}
