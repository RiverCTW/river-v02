import { Extension, type Editor } from "@tiptap/core";
import { Fragment, type Node as PMNode, type Schema } from "@tiptap/pm/model";
import { NodeSelection, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { closeHistory, history, redo, undo } from "@tiptap/pm/history";
import { nanoid } from "nanoid";

let activeSubtreeDragId: string | null = null;

/**
 * Own the history plugin here so its private `closeHistory` key and the
 * clear command below are guaranteed to come from the same module instance.
 */
export const RiverHistory = Extension.create({
  name: "undoRedo",
  addOptions() {
    return {
      depth: 100,
      newGroupDelay: 500,
    };
  },
  addCommands() {
    return {
      undo: () => ({ state, dispatch }: { state: EditorState; dispatch?: (tr: Transaction) => void }) => undo(state, dispatch),
      redo: () => ({ state, dispatch }: { state: EditorState; dispatch?: (tr: Transaction) => void }) => redo(state, dispatch),
    };
  },
  addProseMirrorPlugins() {
    return [history(this.options)];
  },
  addKeyboardShortcuts() {
    return {
      "Mod-z": () => this.editor.commands.undo(),
      "Shift-Mod-z": () => this.editor.commands.redo(),
      "Mod-y": () => this.editor.commands.redo(),
      "Mod-я": () => this.editor.commands.undo(),
      "Shift-Mod-я": () => this.editor.commands.redo(),
    };
  },
});

export function beginSubtreeDrag(id: string): void {
  activeSubtreeDragId = id;
}

export function endSubtreeDrag(): void {
  activeSubtreeDragId = null;
}

export function getActiveSubtreeDrag(): string | null {
  return activeSubtreeDragId;
}

export interface ListItemHit {
  id: string;
  pos: number;
  node: PMNode;
  depth: number;
}

function itemId(node: PMNode): string | null {
  return String(node.attrs.nodeId || node.attrs.blockId || "");
}

export function itemHasVisibleMarker(node: PMNode): boolean {
  return node.type.name === "listItem"
    && node.attrs.itemType !== "block"
    && Number(node.attrs.headingLevel || 0) === 0
    && node.attrs.markerVisible !== false;
}

export function findListItemById(doc: PMNode, id: string): ListItemHit | null {
  let hit: ListItemHit | null = null;
  doc.descendants((node, pos) => {
    if (hit) return false;
    if (node.type.name !== "listItem" || itemId(node) !== id) return true;
    hit = { id, pos, node, depth: doc.resolve(pos).depth };
    return false;
  });
  return hit;
}

export function findNearestListItem(doc: PMNode, position: number): ListItemHit | null {
  const $pos = doc.resolve(Math.max(0, Math.min(position, doc.content.size)));
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name === "listItem") {
      const id = itemId(node);
      if (id) return { id, pos: $pos.before(depth), node, depth };
    }
  }
  return null;
}

/**
 * Returns the items a structural command should act on.
 *
 * A collapsed caret must resolve to its *innermost* item. The previous
 * implementation collected ancestors and kept the shallowest depth, so
 * Shift+Tab on a child lifted the parent out of the outline instead.
 */
export function getSelectedStructuralItems(editor: Editor): ListItemHit[] {
  const { state } = editor;
  const { selection } = state;
  if (selection.empty) {
    const hit = findNearestListItem(state.doc, selection.from);
    return hit ? [hit] : [];
  }
  const items: ListItemHit[] = [];
  state.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
    if (node.type.name !== "listItem") return true;
    const id = itemId(node);
    if (id) items.push({ id, pos, node, depth: state.doc.resolve(pos).depth });
    return false;
  });
  // `nodesBetween` already stops at each matching item, but a multi-cursor
  // selection can still enqueue a child before its ancestor. Structural
  // commands must act on each outermost item exactly once; descendants move
  // with their parent subtree.
  const sorted = [...items].sort((a, b) => a.pos - b.pos);
  return sorted.filter((item, index) =>
    !sorted.slice(0, index).some((parent) => item.pos > parent.pos && item.pos < parent.pos + parent.node.nodeSize));
}

/** Places the caret in the first text position of an item without DOM hacks. */
export function selectInsideItem(editor: Editor, hit: ListItemHit, fallbackToEnd = false): number | null {
  const doc = editor.state.doc;
  const start = Math.min(hit.pos + 1, doc.content.size);
  try {
    const selection = TextSelection.near(doc.resolve(start), fallbackToEnd ? -1 : 1);
    editor.view.dispatch(editor.state.tr.setSelection(selection));
    return selection.from;
  } catch {
    return null;
  }
}

function currentTextOffset(editor: Editor): number {
  const { selection } = editor.state;
  if (!(selection instanceof TextSelection)) return 0;
  return Math.max(0, selection.$from.parentOffset);
}

function focusItemAtOffset(editor: Editor, id: string, offset: number): boolean {
  const hit = findListItemById(editor.state.doc, id);
  if (!hit) return false;
  const paragraph = hit.node.firstChild;
  if (!paragraph || !paragraph.isTextblock) return false;
  const position = hit.pos + 2 + Math.min(offset, paragraph.content.size);
  try {
    editor.commands.focus(position);
    return true;
  } catch {
    return false;
  }
}

export function indentSelectedItems(editor: Editor): boolean {
  const items = getSelectedStructuralItems(editor);
  if (!items.length) return false;
  const primaryId = items[0].id;
  const offset = currentTextOffset(editor);
  let changed = false;
  for (const item of [...items].reverse()) {
    const current = findListItemById(editor.state.doc, item.id);
    if (!current) continue;
    if (selectInsideItem(editor, current) === null) continue;
    changed = editor.commands.sinkListItem("listItem") || changed;
  }
  if (changed) focusItemAtOffset(editor, primaryId, offset);
  return changed;
}

export function outdentSelectedItems(editor: Editor): boolean {
  const items = getSelectedStructuralItems(editor);
  if (!items.length) return false;
  const primaryId = items[0].id;
  const offset = currentTextOffset(editor);
  let changed = false;
  for (const item of [...items].reverse()) {
    const current = findListItemById(editor.state.doc, item.id);
    if (!current) continue;
    if (selectInsideItem(editor, current) === null) continue;
    changed = editor.commands.liftListItem("listItem") || changed;
  }
  if (changed) focusItemAtOffset(editor, primaryId, offset);
  return changed;
}

export function enterInEmptyItem(editor: Editor): boolean {
  const { state } = editor;
  const selection = state.selection;
  if (!selection.empty) return false;
  const current = findNearestListItem(state.doc, selection.from);
  if (!current || current.node.childCount !== 1) return false;
  const paragraph = current.node.firstChild;
  if (!paragraph || paragraph.content.size !== 0) return false;

  if (itemHasVisibleMarker(current.node)) {
    if (outdentSelectedItems(editor)) return true;
    editor.view.dispatch(state.tr.setNodeMarkup(current.pos, undefined, {
      ...current.node.attrs,
      headingLevel: 0,
      markerVisible: false,
      userModified: true,
      updatedAt: new Date().toISOString(),
    }).scrollIntoView());
    return true;
  }
  return false;
}

function findPreviousListItem(doc: PMNode, before: number): ListItemHit | null {
  let previous: ListItemHit | null = null;
  doc.descendants((node, pos) => {
    if (node.type.name !== "listItem") return true;
    const id = itemId(node);
    if (!id || pos + node.nodeSize > before) return true;
    if (!previous || pos > previous.pos) previous = { id, pos, node, depth: doc.resolve(pos).depth };
    return true;
  });
  return previous;
}

/** Handles Backspace/Delete at the boundary of an empty outline item. */
export function backspaceOutlineBoundary(editor: Editor): boolean {
  const { state } = editor;
  const selection = state.selection;
  if (!(selection instanceof TextSelection) || !selection.empty) return false;
  const current = findNearestListItem(state.doc, selection.from);
  if (!current || current.node.childCount !== 1) return false;
  const paragraph = current.node.firstChild;
  if (!paragraph || paragraph.content.size !== 0) return false;

  if (itemHasVisibleMarker(current.node)) {
    if (outdentSelectedItems(editor)) return true;
    editor.view.dispatch(state.tr.setNodeMarkup(current.pos, undefined, {
      ...current.node.attrs,
      headingLevel: 0,
      markerVisible: false,
      userModified: true,
      updatedAt: new Date().toISOString(),
    }).scrollIntoView());
    return true;
  }

  if (Number(current.node.attrs.headingLevel || 0) > 0) {
    editor.view.dispatch(state.tr.setNodeMarkup(current.pos, undefined, {
      ...current.node.attrs,
      headingLevel: 0,
      markerVisible: false,
      userModified: true,
      updatedAt: new Date().toISOString(),
    }).scrollIntoView());
    return true;
  }

  const previous = findPreviousListItem(state.doc, current.pos);
  if (!previous) return false;
  const previousId = previous.id;
  const transaction = state.tr.delete(current.pos, current.pos + current.node.nodeSize);
  ensureDocumentNotEmpty(transaction);
  const previousAfter = findListItemById(transaction.doc, previousId);
  if (!previousAfter) {
    editor.view.dispatch(transaction.scrollIntoView());
    return true;
  }
  const previousParagraph = previousAfter.node.firstChild;
  const caret = previousAfter.pos + 2 + (previousParagraph?.content.size || 0);
  placeCaretNear(transaction, caret);
  editor.view.dispatch(transaction.scrollIntoView());
  return true;
}

export function deleteSelectedSubtrees(editor: Editor): boolean {
  const selection = editor.state.selection;
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== "listItem") return false;

  const { doc } = editor.state;
  const itemPos = selection.from;
  const item = doc.nodeAt(itemPos);
  if (!item || item.type.name !== "listItem") return false;

  const $item = doc.resolve(itemPos);
  const listDepth = $item.depth;
  const list = $item.node(listDepth);
  const listPos = $item.before(listDepth);
  const onlyItem = list.childCount === 1;

  const transaction = editor.state.tr;
  if (onlyItem) {
    transaction.delete(listPos, listPos + list.nodeSize);
    ensureDocumentNotEmpty(transaction);
  } else {
    transaction.delete(itemPos, itemPos + item.nodeSize);
  }
  placeCaretNear(transaction, Math.min(itemPos, transaction.doc.content.size));
  editor.view.dispatch(transaction.scrollIntoView());
  return true;
}

function ensureDocumentNotEmpty(transaction: Transaction): void {
  if (transaction.doc.childCount > 0) return;
  const empty = createEmptyOutlineNode(transaction.doc.type.schema);
  if (empty) transaction.insert(0, empty);
}

function placeCaretNear(transaction: Transaction, position: number): void {
  try {
    const selection = TextSelection.near(transaction.doc.resolve(Math.min(position, transaction.doc.content.size)), 1);
    transaction.setSelection(selection);
  } catch {
    // Structural integrity matters more than an exact caret fallback.
  }
}

/** Builds the canonical one-item outline document body. */
export function createEmptyOutlineNode(schema: Schema): PMNode | null {
  const bulletList = schema.nodes.bulletList;
  const listItem = schema.nodes.listItem;
  const paragraph = schema.nodes.paragraph;
  if (!bulletList || !listItem || !paragraph) return null;
  const now = new Date().toISOString();
  return bulletList.create(
    null,
    listItem.create(
      {
        itemType: "knowledge",
        nodeId: nanoid(),
        blockId: null,
        blockType: "explanation",
        nodeType: "knowledge",
        headingLevel: 1,
        markerVisible: false,
        collapsed: false,
        sourceRefs: [],
        userModified: true,
        createdAt: now,
        updatedAt: now,
      },
      paragraph.create(),
    ),
  );
}

/** Replaces the whole document with a valid empty outline in one undo step. */
export function replaceDocumentWithEmptyOutline(editor: Editor): boolean {
  const empty = createEmptyOutlineNode(editor.state.schema);
  if (!empty) return false;
  const transaction = editor.state.tr;
  closeHistory(transaction);
  const size = transaction.doc.content.size;
  transaction.replaceWith(0, size, empty);
  placeCaretNear(transaction, 2);
  editor.view.dispatch(transaction.scrollIntoView());
  // closeHistory above isolates the clear from the previous edit. Close again
  // after it so the next keystroke starts a separate undo event instead of
  // being coalesced with the whole-document replacement.
  const closeTransaction = closeHistory(editor.state.tr);
  editor.view.dispatch(closeTransaction);
  return true;
}

export function isWholeDocumentSelected(editor: Editor): boolean {
  const { selection, doc } = editor.state;
  if (selection.empty) return false;
  return selection.from <= 1 && selection.to >= doc.content.size - 1;
}

export function insertSiblingAfterSubtree(editor: Editor): boolean {
  const { state } = editor;
  const item = findNearestListItem(state.doc, state.selection.from);
  if (!item) return false;
  return insertSiblingAfterSubtreeAt(editor, item.pos + item.node.nodeSize);
}

/**
 * Splits the current item at the caret, giving the new item fresh identity.
 *
 * `splitListItem` is intentionally not used here. A River item is
 * "own paragraph + optional block/child lists"; the stock command moves every
 * child after the split point into the new sibling, so pressing Enter at the
 * end of a parent silently detaches its whole subtree. Outline semantics are
 * the opposite: the parent keeps its subtree, and the new sibling only takes
 * the inline content after the caret.
 */
export function splitItemAtSelection(editor: Editor, placement: "sibling" | "child" = "sibling"): boolean {
  const { state } = editor;
  // A structural split is its own undo event. Without this boundary the
  // history plugin groups it with the keystrokes that produced the text, so
  // one Cmd+Z also erases everything the user typed before pressing Enter.
  const transaction = closeHistory(state.tr);

  // Replacing a selection and splitting is one undo step: delete the selected
  // range in the same transaction that inserts the new sibling.
  if (!state.selection.empty) transaction.deleteSelection();

  const item = findNearestListItem(transaction.doc, transaction.selection.from);
  if (!item) {
    if (!transaction.docChanged) return false;
    editor.view.dispatch(transaction.scrollIntoView());
    return true;
  }

  const itemNodeType = item.node.type;
  const listItemType = state.schema.nodes.listItem;
  const paragraphType = state.schema.nodes.paragraph;
  if (!listItemType || !paragraphType) return false;
  if (itemNodeType !== listItemType) return false;

  const paragraph = item.node.firstChild;
  if (!paragraph || paragraph.type.name !== "paragraph") return false;

  const paragraphPos = item.pos + 1;
  const caret = transaction.selection.from;
  const offset = caret - paragraphPos - 1;
  if (offset < 0 || offset > paragraph.content.size) return false;

  const leftParagraph = paragraph.type.create(paragraph.attrs, paragraph.content.cut(0, offset), paragraph.marks);
  const rightParagraph = paragraph.type.create(paragraph.attrs, paragraph.content.cut(offset), paragraph.marks);

  // Everything after the item's own paragraph (blocks and child lists) stays
  // with the item being split. Only inline content after the caret moves.
  const retainedChildren = item.node.content.cut(paragraph.nodeSize);
  const now = new Date().toISOString();
  const isBlock = item.node.attrs.itemType === "block";
  const nextMarkerVisible = itemHasVisibleMarker(item.node);
  const id = nanoid();
  const newSibling = listItemType.create(
    {
      ...item.node.attrs,
      itemType: isBlock ? "block" : "knowledge",
      nodeType: isBlock ? item.node.attrs.nodeType : "knowledge",
      headingLevel: 0,
      markerVisible: nextMarkerVisible,
      nodeId: isBlock ? null : id,
      blockId: isBlock ? id : null,
      collapsed: false,
      sourceRefs: [],
      userModified: true,
      createdAt: now,
      updatedAt: now,
    },
    rightParagraph,
  );

  const retainedNodes: PMNode[] = [];
  retainedChildren.forEach((child) => retainedNodes.push(child));
  let finalItem = itemNodeType.create(
    item.node.attrs,
    Fragment.from(leftParagraph).append(Fragment.fromArray(retainedNodes)),
    item.node.marks,
  );
  if (placement === "child") {
    const parentList = state.doc.resolve(item.pos).parent;
    const last = retainedNodes[retainedNodes.length - 1];
    if (last && last.type === parentList.type) {
      retainedNodes[retainedNodes.length - 1] = last.copy(last.content.append(Fragment.from(newSibling)));
    } else {
      retainedNodes.push(parentList.type.create(parentList.attrs, newSibling));
    }
    finalItem = itemNodeType.create(
      item.node.attrs,
      Fragment.from(leftParagraph).append(Fragment.fromArray(retainedNodes)),
      item.node.marks,
    );
  }

  // Replace and insert in one step. Doing the insert afterwards would map its
  // position through the replacement a second time, so any split that shortens
  // the item (the common case) would drop the new sibling inside the old one.
  const itemEnd = item.pos + item.node.nodeSize;
  const replacement = placement === "child" ? [finalItem] : [finalItem, newSibling];
  transaction.replaceWith(item.pos, itemEnd, Fragment.fromArray(replacement));
  if (placement === "sibling") placeCaretNear(transaction, item.pos + finalItem.nodeSize + 2);
  editor.view.dispatch(transaction.scrollIntoView());
  focusItemAtOffset(editor, id, 0);
  return true;
}

export function moveSubtree(
  editor: Editor,
  sourceId: string,
  targetId: string,
  placement: "before" | "after",
): boolean {
  const source = findListItemById(editor.state.doc, sourceId);
  const target = findListItemById(editor.state.doc, targetId);
  if (!source || !target || source.id === target.id) return false;
  if (source.pos <= target.pos && target.pos < source.pos + source.node.nodeSize) return false;

  const originalInsertAt = placement === "before" ? target.pos : target.pos + target.node.nodeSize;
  const transaction = editor.state.tr.delete(source.pos, source.pos + source.node.nodeSize);
  const insertAt = transaction.mapping.map(originalInsertAt, -1);
  transaction.insert(insertAt, source.node);
  editor.view.dispatch(transaction.scrollIntoView());
  return true;
}

export function selectStructuralItem(editor: Editor, pos: number): boolean {
  try {
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));
    return true;
  } catch {
    return false;
  }
}

function insertSiblingAfterSubtreeAt(editor: Editor, after: number): boolean {
  const listItemType = editor.state.schema.nodes.listItem;
  const paragraphType = editor.state.schema.nodes.paragraph;
  if (!listItemType || !paragraphType) return false;
  const now = new Date().toISOString();
  const nodeId = nanoid();
  const newNode = listItemType.create(
    {
      itemType: "knowledge",
      nodeId,
      blockId: null,
      blockType: "explanation",
      nodeType: "knowledge",
      headingLevel: 0,
      markerVisible: true,
      collapsed: false,
      sourceRefs: [],
      userModified: true,
      createdAt: now,
      updatedAt: now,
    },
    paragraphType.create(),
  );
  const transaction = editor.state.tr.insert(after, newNode);
  placeCaretNear(transaction, after + 2);
  editor.view.dispatch(transaction.scrollIntoView());
  focusItemAtOffset(editor, nodeId, 0);
  return true;
}

/**
 * Converts the list type of the item that contains `position` and nothing
 * else. The enclosing list is split into up to three lists so that sibling
 * items keep their original marker style.
 */
export function convertItemListType(
  state: Editor["state"],
  position: number,
  targetType: "bulletList" | "orderedList",
  start = 1,
): Transaction | null {
  const transaction = state.tr;
  return convertItemListTypeInTransaction(transaction, position, targetType, start);
}

/**
 * Same local list conversion, applied on an existing transaction (used by
 * input rules so the marker removal and the conversion are one step).
 */
export function convertItemListTypeInTransaction(
  transaction: Transaction,
  position: number,
  targetType: "bulletList" | "orderedList",
  start = 1,
): Transaction | null {
  const hit = findNearestListItem(transaction.doc, position);
  if (!hit) return null;
  const $item = transaction.doc.resolve(hit.pos);
  const listDepth = $item.depth;
  const list = $item.node(listDepth);
  if (list.type.name === targetType) return transaction;

  const listPos = $item.before(listDepth);
  const index = $item.index();
  let offset = 0;
  for (let childIndex = 0; childIndex < index; childIndex += 1) offset += list.child(childIndex).nodeSize;

  const targetNodeType = transaction.doc.type.schema.nodes[targetType];
  if (!targetNodeType) return null;
  const before = offset > 0 ? list.type.create(list.attrs, list.content.cut(0, offset)) : null;
  const afterStart = offset + hit.node.nodeSize;
  const after = afterStart < list.content.size ? list.type.create(list.attrs, list.content.cut(afterStart)) : null;
  const isolated = targetNodeType.create(
    targetType === "orderedList" ? { ...list.attrs, start } : list.attrs,
    Fragment.from(hit.node),
  );

  const replacement: PMNode[] = [];
  if (before) replacement.push(before);
  replacement.push(isolated);
  if (after) replacement.push(after);
  transaction.replaceWith(listPos, listPos + list.nodeSize, replacement);
  try {
    const caret = Math.min(listPos + (before ? before.nodeSize : 0) + 2, transaction.doc.content.size);
    transaction.setSelection(TextSelection.near(transaction.doc.resolve(caret), 1));
  } catch {
    // The list conversion is still valid without a caret.
  }
  return transaction;
}

export function setItemListType(editor: Editor, targetType: "bulletList" | "orderedList", start = 1): boolean {
  const transaction = convertItemListType(editor.state, editor.state.selection.from, targetType, start);
  if (!transaction) return false;
  if (!transaction.docChanged) return true;
  editor.view.dispatch(transaction.scrollIntoView());
  return true;
}
