import { describe, expect, it } from "vitest";
import type { ContentBlock, KnowledgeNode } from "../src/types";
import { nodesToTiptap, normalizeEditorDocument, tiptapToNodes } from "../src/editor/convert";

describe("River outline conversion", () => {
  it("round-trips hierarchy, block types, semantic text and source metadata", () => {
    const createdAt = "2026-10-14T10:00:00.000Z";
    const updatedAt = "2026-10-14T11:00:00.000Z";
    const nodes: KnowledgeNode[] = [
      {
        id: "root",
        noteId: "note-1",
        parentId: null,
        order: 0,
        title: "生命周期评估",
        nodeType: "root",
        headingLevel: 1,
        collapsed: false,
        sourceRefs: [{ sourceId: "source-1", slideNumber: 1 }],
        userModified: false,
        createdAt,
        updatedAt,
      },
      {
        id: "child",
        noteId: "note-1",
        parentId: "root",
        order: 0,
        title: "四个步骤",
        nodeType: "knowledge",
        headingLevel: 2,
        collapsed: true,
        sourceRefs: [{ sourceId: "source-1", slideNumber: 4, quote: "确定目标与范围" }],
        userModified: true,
        createdAt,
        updatedAt,
      },
    ];
    const blocks: ContentBlock[] = [
      {
        id: "block-1",
        nodeId: "child",
        noteId: "note-1",
        order: 0,
        type: "definition",
        text: "**LCA** 是 ++全生命周期++ 的环境影响评估方法。",
        sourceRefs: [{ sourceId: "source-1", slideNumber: 3 }],
        userModified: false,
        createdAt,
        updatedAt,
      },
    ];

    const doc = nodesToTiptap(nodes, blocks);
    const roundTrip = tiptapToNodes(doc, "note-1");
    const root = roundTrip.nodes.find((node) => node.id === "root");
    const child = roundTrip.nodes.find((node) => node.id === "child");
    const block = roundTrip.blocks.find((item) => item.id === "block-1");

    expect(root).toMatchObject({ title: "生命周期评估", parentId: null, headingLevel: 1, sourceRefs: nodes[0].sourceRefs, createdAt, updatedAt });
    expect(child).toMatchObject({ title: "四个步骤", parentId: "root", headingLevel: 2, collapsed: true, userModified: true, createdAt, updatedAt });
    expect(block).toMatchObject({ nodeId: "child", type: "definition", text: blocks[0].text, sourceRefs: blocks[0].sourceRefs, createdAt, updatedAt });
  });

  it("does not project a root paragraph into an extra knowledge node", () => {
    const result = tiptapToNodes({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "不应成为知识节点" }] },
        { type: "bulletList", content: [{ type: "listItem", attrs: { itemType: "knowledge", nodeId: "n1" }, content: [{ type: "paragraph", content: [{ type: "text", text: "有效节点" }] }] }] },
      ],
    }, "note-1");

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes.some((node) => node.title === "不应成为知识节点")).toBe(false);
    expect(result.nodes.some((node) => node.id === "n1" && node.title === "有效节点")).toBe(true);
  });

  it("ignores empty editor trailing paragraphs when converting back to River data", () => {
    const result = tiptapToNodes({
      type: "doc",
      content: [
        { type: "bulletList", content: [{ type: "listItem", attrs: { itemType: "knowledge", nodeId: "n1" }, content: [{ type: "paragraph", content: [{ type: "text", text: "有效节点" }] }] }] },
        { type: "paragraph" },
      ],
    }, "note-1");

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]).toMatchObject({ id: "n1", title: "有效节点" });
  });

  it("keeps blank lines when a block is round-tripped", () => {
    const blocks: ContentBlock[] = [{
      id: "b1",
      nodeId: "n1",
      noteId: "note-1",
      order: 0,
      type: "explanation",
      text: "第一行\n\n第三行\n第四行",
      sourceRefs: [],
      userModified: true,
      createdAt: "2026-10-14T10:00:00.000Z",
      updatedAt: "2026-10-14T10:00:00.000Z",
    }];
    const nodes: KnowledgeNode[] = [makeNode("n1", "含空行的条目")];

    const doc = nodesToTiptap(nodes, blocks);
    const nodeItem = doc.content?.[0]?.content?.[0];
    const item = nodeItem?.content?.find((child) => child.type === "bulletList")?.content?.[0];
    expect(item?.content?.filter((child) => child.type === "paragraph")).toHaveLength(4);
    expect(tiptapToNodes(doc, "note-1").blocks[0].text).toBe("第一行\n\n第三行\n第四行");
  });

  it("keeps all six heading levels and node identity through conversion", () => {
    const nodes: KnowledgeNode[] = Array.from({ length: 6 }, (_, index) => makeNode(
      `h${index + 1}`,
      `标题 ${index + 1}`,
      { order: index, headingLevel: (index + 1) as 1 | 2 | 3 | 4 | 5 | 6 },
    ));

    const roundTrip = tiptapToNodes(nodesToTiptap(nodes, []), "note-1");
    expect(roundTrip.nodes.map((node) => [node.id, node.headingLevel])).toEqual([
      ["h1", 1],
      ["h2", 2],
      ["h3", 3],
      ["h4", 4],
      ["h5", 5],
      ["h6", 6],
    ]);
  });

  it("preserves mixed bullet and ordered sibling lists without regrouping", () => {
    const nodes: KnowledgeNode[] = [
      makeNode("a", "无序甲", { order: 0, listType: "bullet" }),
      makeNode("b", "有序乙", { order: 1, listType: "ordered" }),
      makeNode("c", "无序丙", { order: 2, listType: "bullet" }),
      makeNode("d", "有序丁", { order: 3, listType: "ordered" }),
    ];
    const doc = nodesToTiptap(nodes, []);

    expect(doc.content?.map((list) => list.type)).toEqual([
      "bulletList",
      "orderedList",
      "bulletList",
      "orderedList",
    ]);
    expect(tiptapToNodes(doc, "note-1").nodes.map((node) => [node.id, node.listType])).toEqual([
      ["a", "bullet"],
      ["b", "ordered"],
      ["c", "bullet"],
      ["d", "ordered"],
    ]);
  });

  it("preserves parent-child order, collapsed state and multiple paragraphs", () => {
    const nodes: KnowledgeNode[] = [
      makeNode("root", "父节点", { order: 0, collapsed: true }),
      makeNode("second", "第二个父节点", { order: 1 }),
      makeNode("child-b", "子节点 B", { order: 1, parentId: "root" }),
      makeNode("child-a", "子节点 A", { order: 0, parentId: "root" }),
    ];
    const blocks: ContentBlock[] = [{
      id: "b1",
      nodeId: "child-a",
      noteId: "note-1",
      order: 0,
      type: "definition",
      text: "第一段\n第二段",
      sourceRefs: [],
      userModified: false,
      createdAt: "2026-10-14T10:00:00.000Z",
      updatedAt: "2026-10-14T10:00:00.000Z",
    }];
    const roundTrip = tiptapToNodes(nodesToTiptap(nodes, blocks), "note-1");

    expect(roundTrip.nodes.filter((node) => node.parentId === null).map((node) => node.id)).toEqual(["root", "second"]);
    expect(roundTrip.nodes.filter((node) => node.parentId === "root").map((node) => node.id)).toEqual(["child-a", "child-b"]);
    expect(roundTrip.nodes.find((node) => node.id === "root")?.collapsed).toBe(true);
    expect(roundTrip.blocks[0].text).toBe("第一段\n第二段");
  });

  it("accepts an empty document without inventing nodes", () => {
    expect(tiptapToNodes({ type: "doc", content: [] }, "note-1")).toEqual({ nodes: [], blocks: [] });
    expect(nodesToTiptap([], []).content).toEqual([]);
  });

  it("keeps ordered roots as valid editor documents", () => {
    const doc = {
      type: "doc",
      content: [{
        type: "orderedList",
        content: [{
          type: "listItem",
          attrs: { itemType: "knowledge", nodeId: "ordered-1" },
          content: [{ type: "paragraph", content: [{ type: "text", text: "第一项" }] }],
        }],
      }],
    };

    expect(normalizeEditorDocument(doc, { noteId: "note-1" })).toBe(doc);
  });

  it("migrates legacy root blocks without losing their text or marks", () => {
    const legacy = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "旧版第一行", marks: [{ type: "bold" }] }] },
        { type: "paragraph" },
        { type: "paragraph", content: [{ type: "text", text: "旧版第三行" }] },
      ],
    };

    const normalized = normalizeEditorDocument(legacy, {
      noteId: "note-1",
      createdAt: "2026-10-14T10:00:00.000Z",
    });
    const projected = tiptapToNodes(normalized, "note-1");

    expect(normalized.type).toBe("doc");
    expect(normalized.content).toHaveLength(1);
    expect(normalized.content?.[0].type).toBe("bulletList");
    expect(projected.nodes).toHaveLength(1);
    expect(projected.nodes[0]).toMatchObject({
      id: "legacy-root-note-1",
      title: "旧版笔记内容",
      parentId: null,
      nodeType: "root",
    });
    expect(projected.blocks.map((block) => block.text)).toEqual(["旧版第一行", "", "旧版第三行"]);

    const firstParagraph = normalized.content?.[0].content?.[0].content?.[1].content?.[0].content?.[0];
    expect(firstParagraph?.content?.[0]).toMatchObject({
      type: "text",
      text: "旧版第一行",
      marks: [{ type: "bold" }],
    });
  });

  it("normalizes legacy documents deterministically for repeated opens", () => {
    const legacy = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "稳定迁移" }] }],
    };
    const options = { noteId: "note-1", createdAt: "2026-10-14T10:00:00.000Z" };

    expect(normalizeEditorDocument(legacy, options)).toEqual(normalizeEditorDocument(legacy, options));
  });

  it("keeps marked text content when projecting to nodes and blocks", () => {
    const result = tiptapToNodes({
      type: "doc",
      content: [{
        type: "bulletList",
        content: [{
          type: "listItem",
          attrs: { itemType: "knowledge", nodeId: "n1" },
          content: [
            { type: "paragraph", content: [{ type: "text", text: "重点", marks: [{ type: "bold" }] }] },
            {
              type: "bulletList",
              content: [{
                type: "listItem",
                attrs: { itemType: "block", blockId: "b1", blockType: "explanation" },
                content: [{
                  type: "paragraph",
                  content: [
                    { type: "text", text: "注释", marks: [{ type: "italic" }] },
                    { type: "text", text: "与普通文字" },
                  ],
                }],
              }],
            },
          ],
        }],
      }],
    }, "note-1");

    expect(result.nodes[0].title).toBe("重点");
    expect(result.blocks[0].text).toBe("注释与普通文字");
  });
});

function makeNode(id: string, title: string, overrides: Partial<KnowledgeNode> = {}): KnowledgeNode {
  return {
    id,
    noteId: "note-1",
    parentId: null,
    order: 0,
    title,
    nodeType: "knowledge",
    headingLevel: 0,
    listType: "bullet",
    collapsed: false,
    sourceRefs: [],
    userModified: true,
    createdAt: "2026-10-14T10:00:00.000Z",
    updatedAt: "2026-10-14T10:00:00.000Z",
    ...overrides,
  };
}
