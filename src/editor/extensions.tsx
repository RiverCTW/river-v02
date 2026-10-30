import { Extension, InputRule, Mark, Node as TiptapNode, mergeAttributes, type Editor } from "@tiptap/core";
import BulletList from "@tiptap/extension-bullet-list";
import Highlight from "@tiptap/extension-highlight";
import ListItem from "@tiptap/extension-list-item";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import { Fragment } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection, type Selection, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { blockTypeLabels, type ContentBlockType } from "../types";
import {
  beginSubtreeDrag,
  backspaceOutlineBoundary,
  convertItemListTypeInTransaction,
  deleteSelectedSubtrees,
  endSubtreeDrag,
  enterInEmptyItem,
  findListItemById,
  findNearestListItem,
  getSelectedStructuralItems,
  indentSelectedItems,
  insertSiblingAfterSubtree,
  isWholeDocumentSelected,
  itemHasVisibleMarker,
  moveSubtree,
  outdentSelectedItems,
  replaceDocumentWithEmptyOutline,
  RiverHistory,
  splitItemAtSelection,
} from "./commands";
import { parseSemanticMarkers, semanticClassName } from "./semanticMarkers";

function currentPosition(getPos: () => number | undefined): number | null {
  const position = getPos();
  return typeof position === "number" ? position : null;
}

/**
 * Reads the caret the user can actually see as an editor selection.
 *
 * ProseMirror mirrors the DOM selection into editor state asynchronously. In
 * the window after a click, `Home`, or `Shift+Arrow`, the DOM caret has already
 * moved while `view.state.selection` still points at the previous line. Forcing
 * the internal DOM observer to flush is not a fix: that observer may replay the
 * older state selection back into the DOM and undo the user's key press.
 *
 * Mapping the live DOM selection through `posAtDOM` keeps the browser as the
 * single source of truth for caret movement.
 */
function selectionFromDom(view: Editor["view"]): Selection | null {
  const domSelection = view.dom.ownerDocument.getSelection();
  if (!domSelection || domSelection.rangeCount === 0) return null;
  const { anchorNode, anchorOffset, focusNode, focusOffset } = domSelection;
  if (!anchorNode || !focusNode) return null;
  if (!view.dom.contains(anchorNode) || !view.dom.contains(focusNode)) return null;
  try {
    const anchor = view.posAtDOM(anchorNode, anchorOffset, -1);
    const head = view.posAtDOM(focusNode, focusOffset, 1);
    const { doc } = view.state;
    if (Math.min(anchor, head) < 0 || Math.max(anchor, head) > doc.content.size) return null;
    const selection = TextSelection.between(doc.resolve(anchor), doc.resolve(head), 1);
    return selection;
  } catch {
    return null;
  }
}

/**
 * Commits a pending DOM caret move before a structural command runs.
 *
 * Only commands that read `state.selection` to decide where to mutate call
 * this. Plain navigation keys are left entirely to the browser.
 */
function syncSelectionBeforeStructuralCommand(view: Editor["view"]): void {
  if (!view.hasFocus()) return;
  const selection = selectionFromDom(view);
  if (!selection || selection.eq(view.state.selection)) return;
  try {
    view.dispatch(view.state.tr.setSelection(selection));
  } catch {
    // A failed sync leaves the previous selection in place, which is still a
    // valid state for the command.
  }
}

function moveSelectionToTextblockBoundary(
  view: Editor["view"],
  boundary: "start" | "end",
  extend: boolean,
): boolean {
  const { state } = view;
  const { selection, doc } = state;
  if (!(selection instanceof TextSelection)) return false;

  const $head = selection.$head;
  let depth = $head.depth;
  while (depth > 0 && !$head.node(depth).isTextblock) depth -= 1;
  if (depth === 0) return false;

  const position = boundary === "start" ? $head.start(depth) : $head.end(depth);
  try {
    const next = extend
      ? TextSelection.create(doc, selection.anchor, position)
      : TextSelection.create(doc, position);
    view.dispatch(state.tr.setSelection(next).scrollIntoView());
    return true;
  } catch {
    return false;
  }
}

function textblockRanges(doc: Editor["state"]["doc"]): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  doc.descendants((node, position) => {
    if (!node.isTextblock) return true;
    ranges.push({ start: position + 1, end: position + node.content.size });
    return false;
  });
  return ranges;
}

function moveHorizontalSelection(view: Editor["view"], direction: -1 | 1, extend: boolean): boolean {
  const { state } = view;
  const { selection, doc } = state;
  if (!(selection instanceof TextSelection)) return false;

  const { $head } = selection;
  let depth = $head.depth;
  while (depth > 0 && !$head.node(depth).isTextblock) depth -= 1;
  if (depth === 0) return false;

  const start = $head.start(depth);
  const end = $head.end(depth);
  let position: number;
  if (!extend && !selection.empty) {
    position = direction < 0 ? selection.from : selection.to;
  } else {
    position = $head.pos + direction;
    if (position < start || position > end) {
      // Chromium leaves Shift+Arrow at the end of a contenteditable textblock
      // when the next textblock is a sibling outline row. Move the extension
      // endpoint explicitly so a selection can cross rows in document order.
      if (!extend) return false;
      const ranges = textblockRanges(doc);
      const currentIndex = ranges.findIndex((range) => $head.pos >= range.start && $head.pos <= range.end);
      if (currentIndex < 0) return false;
      const adjacent = ranges[currentIndex + direction];
      if (!adjacent) return false;
      position = direction < 0 ? adjacent.end : adjacent.start;
    }
  }

  try {
    const next = extend
      ? TextSelection.create(doc, selection.anchor, position)
      : TextSelection.create(doc, position);
    view.dispatch(state.tr.setSelection(next).scrollIntoView());
    return true;
  } catch {
    return false;
  }
}

function wrapInlineMarkerAtSelection(editor: Editor, marker: string): boolean {
  const { from, to } = editor.state.selection;
  const selected = editor.state.doc.textBetween(from, to, "\n");
  const content = `${marker}${selected}${marker}`;
  const transaction = editor.state.tr.insertText(content, from, to);
  if (selected) {
    transaction.setSelection(TextSelection.create(transaction.doc, from + marker.length, from + marker.length + selected.length));
  } else {
    transaction.setSelection(TextSelection.create(transaction.doc, from + marker.length));
  }
  editor.view.dispatch(transaction);
  return true;
}

/**
 * A River document is always one or more outline lists.
 *
 * ProseMirror's default document schema accepts any block and inserts a
 * top-level paragraph whenever the document becomes empty. That paragraph
 * cannot be represented by the knowledge-node projection and makes a cleared
 * document structurally different from a fresh note. Keeping the constraint
 * in the schema prevents invalid roots from being created at all.
 */
export const RiverDocument = TiptapNode.create({
  name: "doc",
  topNode: true,
  content: "(bulletList|orderedList)+",
});

/**
 * River bold is a real ProseMirror mark, but unlike TipTap's stock Bold
 * extension it deliberately has no `**text**` input rule. The double-star
 * syntax belongs to River's pink semantic marker and must remain untouched.
 */
export const RiverBold = Mark.create({
  name: "bold",
  inclusive: true,
  keepOnSplit: false,
  parseHTML() {
    return [
      { tag: "strong" },
      { tag: "b" },
      {
        style: "font-weight",
        getAttrs: (value) => /^(bold|[6-9]\d\d)$/.test(String(value).trim()) ? null : false,
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ["strong", mergeAttributes(HTMLAttributes), 0];
  },
  addKeyboardShortcuts() {
    return {
      "Mod-b": () => this.editor.commands.toggleMark(this.name),
    };
  },
});

export const OutlineListItem = ListItem.extend({
  draggable: false,
  addAttributes() {
    return {
      ...this.parent?.(),
      itemType: {
        default: "knowledge",
        parseHTML: (element) => element.getAttribute("data-item-type") || "knowledge",
        renderHTML: (attributes) => ({ "data-item-type": attributes.itemType }),
      },
      nodeId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-node-id"),
        renderHTML: (attributes) => attributes.nodeId ? { "data-node-id": attributes.nodeId } : {},
      },
      blockId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-block-id"),
        renderHTML: (attributes) => attributes.blockId ? { "data-block-id": attributes.blockId } : {},
      },
      blockType: {
        default: "explanation",
        parseHTML: (element) => element.getAttribute("data-block-type") || "explanation",
        renderHTML: (attributes) => ({ "data-block-type": attributes.blockType }),
      },
      nodeType: {
        default: "knowledge",
        parseHTML: (element) => element.getAttribute("data-node-type") || "knowledge",
        renderHTML: (attributes) => ({ "data-node-type": attributes.nodeType }),
      },
      headingLevel: {
        default: 0,
        parseHTML: (element) => Number(element.getAttribute("data-heading") || 0),
        renderHTML: (attributes) => ({ "data-heading": String(attributes.headingLevel || 0) }),
      },
      markerVisible: {
        default: true,
        parseHTML: (element) => element.getAttribute("data-marker-visible") !== "false",
        renderHTML: (attributes) => ({ "data-marker-visible": attributes.markerVisible === false ? "false" : "true" }),
      },
      textAlign: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-text-align"),
        renderHTML: (attributes) => attributes.textAlign ? { "data-text-align": String(attributes.textAlign) } : {},
      },
      collapsed: {
        default: false,
        parseHTML: (element) => element.getAttribute("data-collapsed") === "true",
        renderHTML: (attributes) => ({ "data-collapsed": attributes.collapsed ? "true" : "false" }),
      },
      sourceRefs: {
        default: [],
        parseHTML: () => [],
        renderHTML: () => ({}),
      },
      userModified: {
        default: false,
        parseHTML: (element) => element.getAttribute("data-user-modified") === "true",
        renderHTML: (attributes) => ({ "data-user-modified": attributes.userModified ? "true" : "false" }),
      },
      clusterId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-cluster-id"),
        renderHTML: (attributes) => attributes.clusterId ? { "data-cluster-id": String(attributes.clusterId) } : {},
      },
      uncertaintyReason: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-uncertainty"),
        renderHTML: (attributes) => attributes.uncertaintyReason ? { "data-uncertainty": String(attributes.uncertaintyReason) } : {},
      },
      evidenceReason: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-evidence"),
        renderHTML: (attributes) => attributes.evidenceReason ? { "data-evidence": String(attributes.evidenceReason) } : {},
      },
      createdAt: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-created-at"),
        renderHTML: (attributes) => attributes.createdAt ? { "data-created-at": attributes.createdAt } : {},
      },
      updatedAt: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-updated-at"),
        renderHTML: (attributes) => attributes.updatedAt ? { "data-updated-at": attributes.updatedAt } : {},
      },
    };
  },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const wrapper = document.createElement("li");
      wrapper.className = "river-outline-item";

      const controls = document.createElement("div");
      controls.className = "river-outline-controls";
      controls.contentEditable = "false";

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "river-outline-toggle";
      toggle.addEventListener("mousedown", (event) => event.preventDefault());
      toggle.addEventListener("click", () => {
        const position = currentPosition(getPos);
        if (position === null) return;
        const currentNode = editor.state.doc.nodeAt(position);
        if (!currentNode) return;
        const isReferenceAnswer = currentNode.attrs.itemType === "block" && currentNode.attrs.blockType === "referenceAnswer";
        if (!isReferenceAnswer && currentNode.childCount < 2) return;
        const transaction = editor.state.tr.setNodeMarkup(position, undefined, {
          ...currentNode.attrs,
          collapsed: !currentNode.attrs.collapsed,
          updatedAt: new Date().toISOString(),
        });
        transaction.setMeta("addToHistory", false);
        editor.view.dispatch(transaction);
      });

      let stableId = String(node.attrs.nodeId || node.attrs.blockId || "");

      const dragHandle = document.createElement("span");
      dragHandle.className = "river-outline-drag-handle";
      dragHandle.contentEditable = "false";
      dragHandle.title = "拖动完整知识分支";
      dragHandle.textContent = "⠿";

      const kind = document.createElement("span");
      kind.className = "river-outline-kind";

      const blockType = document.createElement("select");
      blockType.className = "river-outline-block-type";
      blockType.title = "内容类型";
      (Object.keys(blockTypeLabels) as ContentBlockType[]).forEach((type) => {
        const option = document.createElement("option");
        option.value = type;
        option.textContent = blockTypeLabels[type];
        blockType.append(option);
      });
      blockType.addEventListener("mousedown", (event) => event.stopPropagation());
      blockType.addEventListener("change", () => {
        const position = currentPosition(getPos);
        if (position === null) return;
        const currentNode = editor.state.doc.nodeAt(position);
        if (!currentNode) return;
        editor.view.dispatch(editor.state.tr.setNodeMarkup(position, undefined, {
          ...currentNode.attrs,
          blockType: blockType.value,
          userModified: true,
          updatedAt: new Date().toISOString(),
        }));
      });

      const uncertainty = document.createElement("button");
      uncertainty.type = "button";
      uncertainty.className = "river-outline-uncertainty";
      uncertainty.textContent = "·";
      uncertainty.hidden = true;
      uncertainty.addEventListener("mousedown", (event) => event.preventDefault());
      uncertainty.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        uncertainty.classList.toggle("is-open");
        wrapper.classList.toggle("show-uncertainty");
      });

      const contentDOM = document.createElement("div");
      contentDOM.className = "river-outline-content";
      controls.append(dragHandle, toggle, kind, uncertainty, blockType);
      wrapper.append(controls, contentDOM);

      // Effie-style drag: there is no dedicated handle. Select text inside an
      // item, then drag from the selection; the whole structural item moves.
      wrapper.addEventListener("dragstart", (event) => {
        const position = currentPosition(getPos);
        if (position === null) return;
        const currentNode = editor.state.doc.nodeAt(position);
        if (!currentNode) return;
        const { selection } = editor.state;
        const itemEnd = position + currentNode.nodeSize;
        const inside = selection.from >= position && selection.from <= itemEnd && selection.to <= itemEnd;
        if (!inside) {
          event.preventDefault();
          return;
        }
        const id = String(currentNode.attrs.nodeId || currentNode.attrs.blockId || stableId);
        if (!id) return;
        event.stopPropagation();
        event.dataTransfer?.setData("application/x-river-outline-node", JSON.stringify({ id }));
        event.dataTransfer?.setData("text/plain", id);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
        beginSubtreeDrag(id);
      });
      wrapper.addEventListener("dragend", () => {
        window.setTimeout(endSubtreeDrag, 0);
      });

      controls.addEventListener("mousedown", (event) => {
        if (event.button !== 0) return;
        if ((event.target as HTMLElement).closest("select")) return;
        const hits = getSelectedStructuralItems(editor);
        let sourceIds = hits.map((hit) => hit.id);
        if (!sourceIds.includes(stableId)) sourceIds = [stableId];
        // Text selection belongs to the browser. A subtree move starts only
        // from the existing bullet/control gutter, with no extra drag handle.
        const startX = event.clientX;
        const startY = event.clientY;
        let moved = false;
        let targetId: string | null = null;
        let placement: "before" | "after" = "after";
        const sources = new Set(sourceIds);
        const clearMarkers = () => {
          document.querySelectorAll(".river-outline-item.is-dragging, .river-outline-item.is-drop-before, .river-outline-item.is-drop-after").forEach((element) => {
            element.classList.remove("is-dragging", "is-drop-before", "is-drop-after");
          });
        };
        const handleMove = (moveEvent: MouseEvent) => {
          if (!moved && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 5) return;
          if (!moved) {
            moved = true;
            window.getSelection()?.removeAllRanges();
          }
          moveEvent.preventDefault();
          moveEvent.stopPropagation();
          clearMarkers();
          for (const id of sourceIds) {
            document.querySelector<HTMLElement>(`[data-node-id="${id}"], [data-block-id="${id}"]`)?.classList.add("is-dragging");
          }
          const stack = document.elementsFromPoint(moveEvent.clientX, moveEvent.clientY) as HTMLElement[];
          const target = stack
            .map((element) => element.closest<HTMLElement>(".river-outline-item"))
            .find((candidate): candidate is HTMLElement => Boolean(candidate && !sources.has(candidate.dataset.nodeId || candidate.dataset.blockId || ""))) || null;
          if (!target) return;
          const id = target.dataset.nodeId || target.dataset.blockId;
          if (!id) return;
          const bounds = target.getBoundingClientRect();
          placement = moveEvent.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
          targetId = id;
          target.classList.add(placement === "before" ? "is-drop-before" : "is-drop-after");
        };
        const handleUp = (upEvent: MouseEvent) => {
          window.removeEventListener("mousemove", handleMove, true);
          window.removeEventListener("mouseup", handleUp, true);
          if (moved) {
            upEvent.preventDefault();
            upEvent.stopPropagation();
            if (targetId && sourceIds[0]) moveSubtree(editor, sourceIds[0], targetId, placement);
            const suppressClick = (clickEvent: MouseEvent) => {
              clickEvent.preventDefault();
              clickEvent.stopPropagation();
            };
            document.addEventListener("click", suppressClick, true);
            window.setTimeout(() => document.removeEventListener("click", suppressClick, true), 0);
          }
          clearMarkers();
        };
        window.addEventListener("mousemove", handleMove, true);
        window.addEventListener("mouseup", handleUp, true);
      });

      const renderAttributes = (nextNode: typeof node) => {
        const itemType = String(nextNode.attrs.itemType || "knowledge");
        const nextBlockType = String(nextNode.attrs.blockType || "explanation");
        const headingLevel = Number(nextNode.attrs.headingLevel || 0);
        const markerVisible = itemHasVisibleMarker(nextNode);
        const collapsed = Boolean(nextNode.attrs.collapsed);
        const hasChildren = nextNode.childCount > 1;
        stableId = String(nextNode.attrs.nodeId || nextNode.attrs.blockId || "");

        wrapper.className = `river-outline-item ${itemType === "block" ? "is-block" : "is-knowledge"}`;
        wrapper.dataset.itemType = itemType;
        wrapper.dataset.blockType = nextBlockType;
        wrapper.dataset.collapsed = collapsed ? "true" : "false";
        wrapper.dataset.heading = String(headingLevel);
        wrapper.dataset.markerVisible = markerVisible ? "true" : "false";
        const textAlign = String(nextNode.attrs.textAlign || "");
        if (textAlign) wrapper.dataset.textAlign = textAlign;
        else delete wrapper.dataset.textAlign;
        wrapper.dataset.testid = `outline-item-${stableId || "unknown"}`;
        if (nextNode.attrs.nodeId) wrapper.dataset.nodeId = String(nextNode.attrs.nodeId);
        else delete wrapper.dataset.nodeId;
        if (nextNode.attrs.blockId) wrapper.dataset.blockId = String(nextNode.attrs.blockId);
        else delete wrapper.dataset.blockId;

        toggle.dataset.hasChildren = hasChildren ? "true" : "false";
        toggle.dataset.collapsed = collapsed ? "true" : "false";
        toggle.setAttribute("aria-label", hasChildren ? (collapsed ? "展开知识点" : "折叠知识点") : "知识点");
        if (hasChildren) toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
        else toggle.removeAttribute("aria-expanded");
        toggle.title = hasChildren ? (collapsed ? "展开" : "折叠") : "知识点";
        const isReferenceAnswer = itemType === "block" && nextBlockType === "referenceAnswer";
        toggle.hidden = !markerVisible && !hasChildren && !isReferenceAnswer;
        if (isReferenceAnswer) {
          toggle.setAttribute("aria-label", collapsed ? "展开参考答案" : "收起参考答案");
          toggle.title = collapsed ? "展开参考答案" : "收起参考答案";
        }

        const uncertaintyReason = String(nextNode.attrs.uncertaintyReason || "");
        uncertainty.hidden = !uncertaintyReason;
        if (uncertaintyReason) {
          uncertainty.title = `把握不大：${uncertaintyReason}`;
          wrapper.dataset.uncertainty = uncertaintyReason;
        } else {
          delete wrapper.dataset.uncertainty;
          wrapper.classList.remove("show-uncertainty");
          uncertainty.classList.remove("is-open");
        }

        const isBlock = itemType === "block";
        kind.hidden = isBlock || headingLevel === 0;
        blockType.hidden = !isBlock;
        kind.textContent = headingLevel === 1 ? "H1" : headingLevel === 2 ? "H2" : headingLevel > 2 ? `H${headingLevel}` : "知识点";
        blockType.value = nextBlockType;
      };

      renderAttributes(node);

      return {
        dom: wrapper,
        contentDOM,
        update: (updatedNode) => {
          if (updatedNode.type !== node.type) return false;
          renderAttributes(updatedNode);
          return true;
        },
        stopEvent: (event) => Boolean((event.target as Element | null)?.closest(".river-outline-controls")),
      };
    };
  },
});

interface InlineSegment {
  from: number;
  to: number;
  pos: number;
  text: string;
}

function buildInlineSegments(node: any, nodePos: number): { text: string; segments: InlineSegment[] } {
  const segments: InlineSegment[] = [];
  let text = "";
  node.forEach((child: any, offset: number) => {
    if (child.isText) {
      const value = child.text || "";
      const from = text.length;
      text += value;
      segments.push({ from, to: text.length, pos: nodePos + 1 + offset, text: value });
    } else if (child.type.name === "hardBreak") {
      const from = text.length;
      text += "\n";
      segments.push({ from, to: text.length, pos: nodePos + 1 + offset, text: "\n" });
    }
  });
  return { text, segments };
}

function offsetToDocPosition(segments: InlineSegment[], offset: number): number | null {
  for (const segment of segments) {
    if (offset < segment.to || (offset === segment.to && segment.text === "\n")) {
      if (segment.text === "\n") return segment.pos;
      return segment.pos + Math.max(0, Math.min(segment.text.length, offset - segment.from));
    }
  }
  const last = segments[segments.length - 1];
  return last ? last.pos + last.text.length : null;
}

function buildSemanticDecorations(doc: any): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node: any, pos: number) => {
    if (!node.isTextblock) return true;
    const { text, segments } = buildInlineSegments(node, pos);
    if (!text) return false;
    parseSemanticMarkers(text).forEach((range) => {
      const from = offsetToDocPosition(segments, range.from);
      const to = offsetToDocPosition(segments, range.to);
      if (from !== null && to !== null && to > from) {
        decorations.push(Decoration.inline(from, to, { class: semanticClassName(range.kind) }));
      }
    });
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

export const SemanticDecoration = Extension.create({
  name: "semanticDecoration",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("semanticDecoration"),
        state: {
          init: (_config, state) => buildSemanticDecorations(state.doc),
          apply: (transaction, previous) => transaction.docChanged ? buildSemanticDecorations(transaction.doc) : previous,
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});

export const SEARCH_HIGHLIGHT_META = "riverSearchHighlight";
interface SearchHighlightState {
  query: string;
  decorations: DecorationSet;
}
const searchHighlightKey = new PluginKey<SearchHighlightState>("riverSearchHighlight");

function buildSearchDecorations(doc: any, query: string): DecorationSet {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  doc.descendants((node: any, pos: number) => {
    if (!node.isText) return;
    const text = String(node.text || "");
    const lower = text.toLowerCase();
    let from = 0;
    while (from < lower.length) {
      const index = lower.indexOf(normalized, from);
      if (index === -1) break;
      decorations.push(Decoration.inline(pos + index, pos + index + normalized.length, { class: "river-search-match" }));
      from = index + Math.max(1, normalized.length);
    }
  });
  return DecorationSet.create(doc, decorations);
}

export const SearchHighlight = Extension.create({
  name: "searchHighlight",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: searchHighlightKey,
        state: {
          init: (_config, state) => ({ query: "", decorations: DecorationSet.empty }),
          apply: (transaction, previous, _oldState, newState) => {
            const next = transaction.getMeta(SEARCH_HIGHLIGHT_META);
            const query = typeof next === "string" ? next : previous.query;
            if (query !== previous.query || transaction.docChanged) {
              return { query, decorations: buildSearchDecorations(newState.doc, query) };
            }
            return previous;
          },
        },
        props: {
          decorations(state) {
            return searchHighlightKey.getState(state)?.decorations || DecorationSet.empty;
          },
        },
      }),
    ];
  },
});

function buildOutlineLineNumbers(doc: any): DecorationSet {
  const decorations: Decoration[] = [];
  let lineNumber = 0;
  doc.descendants((node: any, position: number) => {
    if (node.type.name !== "listItem") return true;
    lineNumber += 1;
    decorations.push(Decoration.node(position, position + node.nodeSize, {
      "data-river-line-number": String(lineNumber),
    }));
    return true;
  });
  return DecorationSet.create(doc, decorations);
}

/** Keep line numbers in editor state so nested lists stay sequential and DOM-safe. */
export const OutlineLineNumbers = Extension.create({
  name: "outlineLineNumbers",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("outlineLineNumbers"),
        state: {
          init: (_config, state) => buildOutlineLineNumbers(state.doc),
          apply: (transaction, previous) => transaction.docChanged ? buildOutlineLineNumbers(transaction.doc) : previous,
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});

/**
 * Structural shortcuts must live inside the ProseMirror keydown pipeline.
 *
 * `EditorView` calls `domObserver.forceFlush()` before it asks plugins to
 * handle a key, so a click or End/Home followed by a structural key is already
 * applied to the editor state here. Flushing the observer a second time is not
 * harmless: it can dispatch a stale selection transaction whose deferred DOM
 * update then overwrites the native selection produced by Home or Shift+Arrow.
 * A React capture-phase listener has the opposite problem: it runs before that
 * built-in flush and therefore reads a stale caret.
 */
export const OutlineKeyboard = Extension.create({
  name: "outlineKeyboard",
  addProseMirrorPlugins() {
    const editor = this.editor;
    let suppressedRepeatKey: string | null = null;
    let compositionEndedAt = 0;
    return [
      new Plugin({
        key: new PluginKey("outlineKeyboard"),
        props: {
          handleDOMEvents: {
            compositionstart: () => { compositionEndedAt = 0; return false; },
            compositionend: () => { compositionEndedAt = Date.now(); return false; },
            keyup: (_view, event) => {
              if (suppressedRepeatKey === event.key) suppressedRepeatKey = null;
              return false;
            },
          },
          handleTextInput: (view, from, to, text) => {
            if (from !== to) return false;
            const closing = text === "(" ? ")" : text === "（" ? "）" : null;
            if (!closing) return false;
            const transaction = view.state.tr.insertText(`${text}${closing}`, from, to);
            transaction.setSelection(TextSelection.create(transaction.doc, from + 1));
            view.dispatch(transaction.scrollIntoView());
            return true;
          },
          handleKeyDown: (view, event) => {
            const native = event as KeyboardEvent & { isComposing?: boolean };
            if (native.isComposing || native.keyCode === 229 || Date.now() - compositionEndedAt < 40) return false;
            const target = event.target as HTMLElement | null;
            if (target?.closest("button, select, [contenteditable='false']")) return false;
            if (event.repeat && suppressedRepeatKey === event.key) {
              event.preventDefault();
              return true;
            }

            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
              event.preventDefault();
              event.stopPropagation();
              return wrapInlineMarkerAtSelection(editor, "**");
            }

            if ((event.key === "Home" || event.key === "End")
              && !event.metaKey && !event.ctrlKey && !event.altKey) {
              if (moveSelectionToTextblockBoundary(
                view,
                event.key === "Home" ? "start" : "end",
                event.shiftKey,
              )) {
                event.preventDefault();
                return true;
              }
            }

            if ((event.key === "ArrowLeft" || event.key === "ArrowRight")
              && !event.metaKey && !event.ctrlKey && !event.altKey) {
              if (moveHorizontalSelection(
                view,
                event.key === "ArrowLeft" ? -1 : 1,
                event.shiftKey,
              )) {
                event.preventDefault();
                return true;
              }
            }

            if (event.key === "Tab") {
              event.preventDefault();
              syncSelectionBeforeStructuralCommand(view);
              if (event.shiftKey) outdentSelectedItems(editor);
              else indentSelectedItems(editor);
              return true;
            }

            if ((event.key === "Backspace" || event.key === "Delete")
              && !event.metaKey && !event.ctrlKey && !event.altKey) {
              if (isWholeDocumentSelected(editor)) {
                event.preventDefault();
                replaceDocumentWithEmptyOutline(editor);
                return true;
              }
              syncSelectionBeforeStructuralCommand(view);
              if (backspaceOutlineBoundary(editor)) {
                suppressedRepeatKey = event.key;
                event.preventDefault();
                return true;
              }
              if (deleteSelectedSubtrees(editor)) {
                event.preventDefault();
                return true;
              }
              return false;
            }

            if (event.key === "Enter" && !event.shiftKey) {
              syncSelectionBeforeStructuralCommand(view);
              const current = findNearestListItem(editor.state.doc, editor.state.selection.from);
              if (!current) return false;
              if (enterInEmptyItem(editor)) {
                suppressedRepeatKey = event.key;
                event.preventDefault();
                return true;
              }
              // Effie creates a sibling after the hidden subtree only when
              // the parent is collapsed; expanded items split normally.
              const handled = !editor.state.selection.empty
                ? splitItemAtSelection(editor, "sibling")
                : current.node.attrs.collapsed
                  ? insertSiblingAfterSubtree(editor)
                  : splitItemAtSelection(editor, "sibling");
              if (handled) {
                suppressedRepeatKey = event.key;
                event.preventDefault();
                return true;
              }
            }
            return false;
          },
        },
      }),
    ];
  },
});

/**
 * Plain-text multi-line paste.
 *
 * ProseMirror's default text parser collapses blank lines, which silently
 * drops user content. Handling text/plain ourselves keeps every line, in
 * order, including empty ones. Rich clipboard payloads (text/html) are left
 * to the default pipeline so formatted paste keeps its semantics.
 */
export function handlePlainTextPaste(view: Editor["view"], event: ClipboardEvent): boolean {
  const data = event.clipboardData;
  if (!data) return false;
  const text = data.getData("text/plain");
  if (!text || !/[\r\n]/.test(text)) return false;
  if (data.getData("text/html")) return false;

  syncSelectionBeforeStructuralCommand(view);
  const { state } = view;
  const { selection } = state;
  const $from = state.doc.resolve(selection.from);
  let depth = $from.depth;
  while (depth > 0 && !$from.node(depth).isTextblock) depth -= 1;
  if (depth === 0) return false;
  const paragraph = $from.node(depth);
  if (paragraph.type.name !== "paragraph") return false;

  const paragraphPos = $from.before(depth);
  const startOffset = selection.from - (paragraphPos + 1);
  const endOffset = selection.to - (paragraphPos + 1);
  if (startOffset < 0 || endOffset < startOffset || endOffset > paragraph.content.size) return false;

  const lines = text.split(/\r\n?|\n/);
  if (lines.length < 2) return false;
  const left = paragraph.content.cut(0, startOffset);
  const right = paragraph.content.cut(endOffset);
  const blocks = lines.map((line, index) => {
    let content = Fragment.empty;
    if (index === 0) content = content.append(left);
    if (line) content = content.append(Fragment.from(state.schema.text(line)));
    if (index === lines.length - 1) content = content.append(right);
    return paragraph.type.create(paragraph.attrs, content, paragraph.marks);
  });

  const transaction = state.tr.replaceWith(
    paragraphPos,
    paragraphPos + paragraph.nodeSize,
    Fragment.fromArray(blocks),
  );
  let lastBlockPos = paragraphPos;
  for (let index = 0; index < blocks.length - 1; index += 1) lastBlockPos += blocks[index].nodeSize;
  const caret = lastBlockPos + 1 + blocks[blocks.length - 1].content.size;
  placeCaret(transaction, caret);
  view.dispatch(transaction.scrollIntoView());
  event.preventDefault();
  return true;
}

function placeCaret(transaction: Transaction, position: number) {
  try {
    transaction.setSelection(TextSelection.near(transaction.doc.resolve(Math.min(position, transaction.doc.content.size)), 1));
  } catch {
    // Keep the pasted content even if the caret cannot be placed.
  }
}

function updateListItemAttrs(state: any, range: { from: number; to: number }, attrs: Record<string, unknown>) {
  const tr = state.tr.delete(range.from, range.to);
  const $from = tr.doc.resolve(Math.min(range.from, tr.doc.content.size));
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name !== "listItem") continue;
    tr.setNodeMarkup($from.before(depth), undefined, {
      ...node.attrs,
      ...attrs,
      userModified: true,
      updatedAt: new Date().toISOString(),
    });
    break;
  }
  try {
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(range.from, tr.doc.content.size)), 1));
  } catch {
    // Keep the attribute transaction even if the caret cannot be placed.
  }
  return tr;
}

export const OutlineInputRules = Extension.create({
  name: "outlineInputRules",
  addInputRules() {
    const headingRule = new InputRule({
      find: /^(#{1,6})\s$/,
      handler: ({ state, range, match }) => updateListItemAttrs(state, range, {
        itemType: "knowledge",
        headingLevel: match[1].length,
        markerVisible: false,
      }),
    });

    const blockRule = (find: RegExp, blockType: ContentBlockType) => new InputRule({
      find,
      handler: ({ state, range }) => updateListItemAttrs(state, range, {
        itemType: "block",
        blockType,
        headingLevel: 0,
        markerVisible: false,
      }),
    });

    // Marker rules convert only the item being typed. The enclosing list is
    // split so sibling items keep their own marker style.
    const listMarkerRule = (find: RegExp, listType: "bulletList" | "orderedList") => new InputRule({
      find,
      handler: ({ state, range, match }) => {
        const original = findNearestListItem(state.doc, range.from);
        const originalId = original?.id;
        const tr = state.tr.delete(range.from, range.to);
        convertItemListTypeInTransaction(tr, range.from, listType, Number(match[1] || 1));
        const convertedItem = originalId ? findListItemById(tr.doc, originalId) : null;
        if (convertedItem) {
          tr.setNodeMarkup(convertedItem.pos, undefined, {
            ...convertedItem.node.attrs,
            itemType: "knowledge",
            blockType: "explanation",
            headingLevel: 0,
            markerVisible: true,
            userModified: true,
            updatedAt: new Date().toISOString(),
          });
        }
      },
    });

    return [
      listMarkerRule(/^(\d+)\.\s$/, "orderedList"),
      listMarkerRule(/^[-+*]\s$/, "bulletList"),
      headingRule,
      blockRule(/^>\s$/, "quote"),
      blockRule(/^```$/, "code"),
      blockRule(/^---$/, "divider"),
    ];
  },
});

export function createOutlineExtensions() {
  return [
    StarterKit.configure({
      document: false,
      bulletList: false,
      listItem: false,
      heading: false,
      bold: false,
      italic: false,
      strike: false,
      underline: false,
      code: false,
      codeBlock: false,
      blockquote: false,
      horizontalRule: false,
      trailingNode: false,
      undoRedo: false,
    }),
    RiverHistory,
    RiverDocument,
    RiverBold,
    BulletList.configure({ keepMarks: true, keepAttributes: true }),
    OutlineListItem,
    Placeholder.configure({ placeholder: "开始输入…按 Enter 新建条目，Tab 缩进，Shift+Tab 提升层级。" }),
    Highlight.configure({ multicolor: true }),
    Underline,
    SemanticDecoration,
    SearchHighlight,
    OutlineLineNumbers,
    OutlineKeyboard,
    OutlineInputRules,
  ];
}
