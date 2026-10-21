import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { isHistoryTransaction } from "@tiptap/pm/history";
import { nanoid } from "nanoid";
import type { ContentBlock, ContentBlockType, EditorDocumentSnapshot, KnowledgeNode, NoteBundle } from "../types";
import { emptyOutlineDocument, nodesToTiptap, normalizeEditorDocument, tiptapToNodes, type TiptapNode } from "./convert";
import { createOutlineExtensions, handlePlainTextPaste } from "./extensions";
import { registerEditorFlush, registerEditorTitleRenamer } from "./editorFlush";
import { cacheEditorSnapshot } from "./snapshotCache";
import { Icon } from "../components/IconSprite";
import { useAppStore } from "../store/useAppStore";
import {
  endSubtreeDrag,
  findNearestListItem,
  getActiveSubtreeDrag,
  moveSubtree,
  setItemListType,
} from "./commands";

export interface OutlineEditorProps {
  bundle: NoteBundle;
  onChange: (nodes: KnowledgeNode[], blocks: ContentBlock[], editorDoc: EditorDocumentSnapshot) => void | Promise<void>;
  focusMode: boolean;
  onToggleFocus: () => void;
  registerFlush?: (flush: (() => void | Promise<void>) | null) => void;
  compact?: boolean;
  readOnly?: boolean;
}

interface SlashState {
  from: number;
  to: number;
  index: number;
  subIndex: number;
  submenuId: string | null;
  left: number;
  top: number;
}

interface SlashSubItem {
  id: string;
  label: string;
  run: (editor: Editor) => boolean;
}

interface SlashMenuItem {
  id: string;
  label: string;
  icon: string;
  grid?: boolean;
  trailing?: "chevron" | "return";
  children?: SlashSubItem[];
  run?: (editor: Editor) => boolean;
}

interface SlashSection {
  id: string;
  layout: "rows" | "grid";
  items: SlashMenuItem[];
}

const AI_SLASH_ITEMS: SlashMenuItem[] = [
  {
    id: "effie-ai",
    label: "Effie AI",
    icon: "sparkles",
    trailing: "chevron",
    children: [
      { id: "ai-improve", label: "优化改写", run: (editor) => notifyUnavailable(editor, "优化改写") },
      { id: "ai-style", label: "调整风格", run: (editor) => notifyUnavailable(editor, "调整风格") },
      { id: "ai-review", label: "AI点评", run: (editor) => notifyUnavailable(editor, "AI点评") },
    ],
  },
  { id: "ask-ai", label: "问 AI", icon: "sparkles", trailing: "return", run: (editor) => notifyUnavailable(editor, "问 AI") },
  {
    id: "rewrite",
    label: "优化改写",
    icon: "wand",
    trailing: "chevron",
    children: [
      { id: "rewrite-clear", label: "表达更清晰", run: (editor) => notifyUnavailable(editor, "表达更清晰") },
      { id: "rewrite-short", label: "表达更简洁", run: (editor) => notifyUnavailable(editor, "表达更简洁") },
    ],
  },
  {
    id: "style",
    label: "调整风格",
    icon: "wand",
    trailing: "chevron",
    children: [
      { id: "style-formal", label: "正式", run: (editor) => notifyUnavailable(editor, "正式风格") },
      { id: "style-plain", label: "通俗", run: (editor) => notifyUnavailable(editor, "通俗风格") },
    ],
  },
];

const FORMAT_SLASH_ITEMS: SlashMenuItem[] = [
  { id: "h1", label: "H1", icon: "H1", grid: true, run: (editor) => applyHeading(editor, 1) },
  { id: "h2", label: "H2", icon: "H2", grid: true, run: (editor) => applyHeading(editor, 2) },
  { id: "h3", label: "H3", icon: "H3", grid: true, run: (editor) => applyHeading(editor, 3) },
  { id: "h4", label: "H4", icon: "H4", grid: true, run: (editor) => applyHeading(editor, 4) },
  { id: "bullet", label: "无序列表", icon: "bullet", grid: true, run: (editor) => applyListMarker(editor, "bulletList") },
  { id: "ordered", label: "有序列表", icon: "ordered", grid: true, run: (editor) => applyListMarker(editor, "orderedList") },
  { id: "bold", label: "粗体", icon: "B", grid: true, run: (editor) => wrapInlineMarker(editor, "**") },
  { id: "italic", label: "斜体", icon: "I", grid: true, run: (editor) => wrapInlineMarker(editor, "*") },
  { id: "strike", label: "删除线", icon: "S", grid: true, run: (editor) => wrapInlineMarker(editor, "~~") },
  { id: "marker", label: "标注", icon: "M", grid: true, run: (editor) => wrapInlineMarker(editor, "::") },
  { id: "comment", label: "评论", icon: "pen", grid: true, run: (editor) => wrapInlineMarker(editor, "++") },
  { id: "code", label: "行内代码", icon: "code", grid: true, run: (editor) => wrapInlineMarker(editor, "`") },
  { id: "quote", label: "引用", icon: "quote", grid: true, run: (editor) => applyBlockType(editor, "quote") },
  { id: "align-left", label: "左对齐", icon: "align-left", grid: true, run: (editor) => applyAlignment(editor, "left") },
  { id: "align-center", label: "居中", icon: "align-center", grid: true, run: (editor) => applyAlignment(editor, "center") },
  { id: "align-right", label: "右对齐", icon: "align-right", grid: true, run: (editor) => applyAlignment(editor, "right") },
  { id: "align-justify", label: "两端对齐", icon: "align-justify", grid: true, run: (editor) => applyAlignment(editor, "justify") },
  { id: "plain", label: "清除格式", icon: "plain", grid: true, run: (editor) => clearFormatting(editor) },
];

const INSERT_SLASH_ITEMS: SlashMenuItem[] = [
  { id: "image", label: "插入图片...", icon: "image", trailing: "return", run: (editor) => notifyUnavailable(editor, "插入图片") },
  { id: "link", label: "插入链接...", icon: "link", trailing: "return", run: (editor) => insertLink(editor) },
  { id: "table", label: "插入表格...", icon: "table", trailing: "return", run: (editor) => notifyUnavailable(editor, "插入表格") },
  { id: "datetime", label: "插入日期和时间", icon: "calendar", trailing: "return", run: (editor) => insertDateTime(editor) },
];

const SLASH_SECTIONS: SlashSection[] = [
  { id: "ai", layout: "rows", items: AI_SLASH_ITEMS },
  { id: "format", layout: "grid", items: FORMAT_SLASH_ITEMS },
  { id: "insert", layout: "rows", items: INSERT_SLASH_ITEMS },
];

const SLASH_NAV_ITEMS = SLASH_SECTIONS.flatMap((section) => section.items);

function SlashMenuIcon({ name }: { name: string }) {
  if (/^(H[1-6]|[BISM])$/.test(name)) {
    return <span className={`river-slash-glyph ${name === "M" ? "is-marker" : ""}`} aria-hidden="true">{name}</span>;
  }
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (name === "sparkles") {
    return <svg {...common}><path d="m12 3 1.2 3.2L16.5 7.5l-3.3 1.3L12 12l-1.2-3.2-3.3-1.3 3.3-1.3L12 3Z"/><path d="m18.5 13 .7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z"/></svg>;
  }
  if (name === "wand") {
    return <svg {...common}><path d="m4 20 10-10"/><path d="m12 4 1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2Z"/><path d="m19 13 .7 1.3L21 15l-1.3.7L19 17l-.7-1.3L17 15l1.3-.7L19 13Z"/></svg>;
  }
  if (name === "bullet") {
    return <svg {...common}><circle cx="5" cy="7" r="1.4" fill="currentColor" stroke="none"/><circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="5" cy="17" r="1.4" fill="currentColor" stroke="none"/><path d="M9 7h10M9 12h10M9 17h10"/></svg>;
  }
  if (name === "ordered") {
    return <span className="river-slash-list-icon" aria-hidden="true"><i>1</i><i>2</i><i>3</i></span>;
  }
  if (name === "pen") {
    return <svg {...common}><path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z"/><path d="m14 7 3 3"/></svg>;
  }
  if (name === "code") {
    return <svg {...common}><path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/></svg>;
  }
  if (name === "quote") {
    return <svg {...common}><path d="M5 7h5v5H7c0 2 .8 3.3 3 4M14 7h5v5h-3c0 2 .8 3.3 3 4"/></svg>;
  }
  if (name.startsWith("align-")) {
    const lines = name === "align-center" ? [6, 4, 6, 4] : name === "align-right" ? [3, 6, 4, 6] : [4, 6, 4, 6];
    return <svg {...common}>{lines.map((length, index) => <path key={index} d={`M${name === "align-right" ? 20 - length : name === "align-center" ? 12 - length / 2 : 4} ${5 + index * 4}h${length}`} />)}</svg>;
  }
  if (name === "plain") {
    return <svg {...common}><path d="M6 5h11M12 5v10"/><path d="m5 19 4-4"/></svg>;
  }
  if (name === "image") {
    return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.5"/><path d="m4 18 5-5 3 3 2-2 6 6"/></svg>;
  }
  if (name === "link") {
    return <svg {...common}><path d="m9 15 6-6M7.5 17.5l-1 1a3.5 3.5 0 0 1-5-5l3-3a3.5 3.5 0 0 1 5 0M16.5 6.5l1-1a3.5 3.5 0 0 1 5 5l-3 3a3.5 3.5 0 0 1-5 0"/></svg>;
  }
  if (name === "table") {
    return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M9 4v16M15 4v16M3 14h18"/></svg>;
  }
  if (name === "calendar") {
    return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/><path d="M7 14h.01M11 14h.01M15 14h.01M7 18h.01M11 18h.01"/></svg>;
  }
  return <span className="river-slash-glyph" aria-hidden="true">•</span>;
}

function applyHeading(editor: Editor, level: 0 | 1 | 2 | 3 | 4 | 5 | 6): boolean {
  return editor.chain().focus().updateAttributes("listItem", {
    itemType: "knowledge",
    headingLevel: level,
    markerVisible: false,
    userModified: true,
    updatedAt: new Date().toISOString(),
  }).run();
}

function notifyUnavailable(_editor: Editor, label: string): boolean {
  useAppStore.getState().showToast(`${label}尚未接入当前编辑器。`, "info");
  return true;
}

function applyListMarker(editor: Editor, listType: "bulletList" | "orderedList"): boolean {
  const converted = setItemListType(editor, listType);
  editor.chain().focus().updateAttributes("listItem", {
    itemType: "knowledge",
    headingLevel: 0,
    markerVisible: true,
    userModified: true,
    updatedAt: new Date().toISOString(),
  }).run();
  return converted;
}

function wrapInlineMarker(editor: Editor, marker: string): boolean {
  const { from, to } = editor.state.selection;
  if (from !== to) {
    const selected = editor.state.doc.textBetween(from, to, "\n");
    editor.chain().focus().insertContentAt({ from, to }, `${marker}${selected}${marker}`).setTextSelection(from + marker.length).run();
    return true;
  }
  editor.chain().focus().insertContent(`${marker}${marker}`).setTextSelection(from + marker.length).run();
  return true;
}

function applyBlockType(editor: Editor, blockType: ContentBlockType): boolean {
  return editor.chain().focus().updateAttributes("listItem", {
    itemType: "block",
    blockType,
    headingLevel: 0,
    markerVisible: false,
    userModified: true,
    updatedAt: new Date().toISOString(),
  }).run();
}

function applyAlignment(editor: Editor, textAlign: "left" | "center" | "right" | "justify"): boolean {
  return editor.chain().focus().updateAttributes("listItem", {
    textAlign,
    userModified: true,
    updatedAt: new Date().toISOString(),
  }).run();
}

function clearFormatting(editor: Editor): boolean {
  return editor.chain().focus().updateAttributes("listItem", {
    itemType: "knowledge",
    headingLevel: 0,
    markerVisible: false,
    textAlign: null,
    blockType: "explanation",
    userModified: true,
    updatedAt: new Date().toISOString(),
  }).run();
}

function insertLink(editor: Editor): boolean {
  const url = window.prompt("输入链接地址");
  if (!url?.trim()) return false;
  const { from, to } = editor.state.selection;
  const selected = editor.state.doc.textBetween(from, to, "\n").trim();
  editor.chain().focus().insertContentAt({ from, to }, selected || url.trim()).run();
  return true;
}

function insertDateTime(editor: Editor): boolean {
  const text = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
  editor.chain().focus().insertContent(text).run();
  return true;
}

function documentForBundle(bundle: NoteBundle): TiptapNode {
  if (bundle.note.editorDoc) {
    return normalizeEditorDocument(bundle.note.editorDoc, {
      noteId: bundle.note.id,
      createdAt: bundle.note.createdAt,
    });
  }
  if (bundle.nodes.length) return nodesToTiptap(bundle.nodes, bundle.blocks);
  return emptyOutlineDocument(bundle.note.title);
}

/** Order-independent signature so a self-save echo never replaces the document. */
function docSignature(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    const sorted: Record<string, unknown> = {};
    Object.keys(item).sort().forEach((key) => {
      if (item[key] !== undefined) sorted[key] = item[key];
    });
    return sorted;
  });
}

export function OutlineEditor({ bundle, onChange, focusMode, onToggleFocus, registerFlush, compact = false, readOnly = false }: OutlineEditorProps) {
  const editorRef = useRef<Editor | null>(null);
  const changeHandler = useRef(onChange);
  const lastNoteId = useRef<string | null>(null);
  const lastDocSignature = useRef<string | null>(null);
  /**
   * Every snapshot this editor sends upward will echo back through Zustand.
   * Two quick commits (for example the intermediate and final states of a
   * double undo) can arrive out of order, so comparing only against the most
   * recent signature is not enough: the older echo then looks like an external
   * document replacement and `setContent` destroys the newer live document.
   */
  const selfSignatures = useRef<Set<string>>(new Set());
  const pendingNoteId = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialContent = useMemo(() => documentForBundle(bundle), []);
  const [slash, setSlash] = useState<SlashState | null>(null);
  const slashRef = useRef<SlashState | null>(null);
  slashRef.current = slash;

  changeHandler.current = onChange;

  const cancelPendingChange = () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    pendingNoteId.current = null;
  };

  const commitPendingChange = (): void | Promise<void> => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const currentEditor = editorRef.current;
    const noteId = pendingNoteId.current;
    if (!currentEditor || !noteId) return undefined;
    pendingNoteId.current = null;
    const editorDoc = currentEditor.getJSON() as EditorDocumentSnapshot;
    const signature = docSignature(editorDoc);
    // A note switch can flush an editor whose document never changed (or was
    // changed and then undone back to the last persisted state). Writing that
    // snapshot would let a stale inline editor overwrite a newer document.
    if (signature === lastDocSignature.current) return undefined;
    lastDocSignature.current = signature;
    selfSignatures.current.add(signature);
    if (selfSignatures.current.size > 16) {
      const oldest = selfSignatures.current.values().next().value;
      if (oldest !== undefined) selfSignatures.current.delete(oldest);
    }
    cacheEditorSnapshot(noteId, editorDoc);
    const { nodes, blocks } = tiptapToNodes(editorDoc as TiptapNode, noteId);
    return changeHandler.current(nodes, blocks, editorDoc);
  };

  const schedulePendingChange = () => {
    const currentEditor = editorRef.current;
    if (!currentEditor) return;
    pendingNoteId.current = bundleRef.current.note.id;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void commitPendingChange();
    }, 180);
  };

  // The bundle is read inside callbacks that outlive a render.
  const bundleRef = useRef(bundle);
  bundleRef.current = bundle;

  const editor = useEditor({
    extensions: createOutlineExtensions(),
    content: initialContent as any,
    editable: !readOnly,
    editorProps: {
      attributes: {
        class: "river-outline-editor",
        spellcheck: "false",
        "data-testid": "river-outline-editor",
      },
      handleDOMEvents: {
        dragover: (_view, event) => {
          if (event.dataTransfer?.types.includes("application/x-river-outline-node")) {
            event.preventDefault();
          }
          return false;
        },
      },
      handlePaste: handlePlainTextPaste,
      handleDrop: (view, event) => {
        const raw = event.dataTransfer?.getData("application/x-river-outline-node");
        const activeDragId = getActiveSubtreeDrag();
        if (!raw && !activeDragId) return false;
        try {
          const source = raw ? JSON.parse(raw) as { id?: string } : { id: activeDragId || undefined };
          if (!source.id) return false;
          const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (!coords) return false;
          const target = findNearestListItem(view.state.doc, coords.pos);
          if (!target || target.id === source.id) return false;
          const placement = coords.pos < target.pos + target.node.nodeSize / 2 ? "before" : "after";
          event.preventDefault();
          const currentEditor = editorRef.current;
          return currentEditor ? moveSubtree(currentEditor, source.id, target.id, placement) : false;
        } catch {
          return false;
        } finally {
          endSubtreeDrag();
        }
      },
    },
    onUpdate: ({ editor: currentEditor, transaction }) => {
      editorRef.current = currentEditor;
      syncSelectionDebug(currentEditor);
      syncSlashMenu(currentEditor);
      if (isHistoryTransaction(transaction)) {
        // Undo/redo is terminal for the current burst of typing. Persisting it
        // immediately keeps a fast reload from restoring the pre-undo body.
        pendingNoteId.current = bundleRef.current.note.id;
        void commitPendingChange();
      } else {
        schedulePendingChange();
      }
    },
    onSelectionUpdate: ({ editor: currentEditor }) => {
      syncSelectionDebug(currentEditor);
      syncSlashMenu(currentEditor);
    },
    onCreate: ({ editor: currentEditor }) => {
      editorRef.current = currentEditor;
      lastDocSignature.current = docSignature(currentEditor.getJSON());
      syncSelectionDebug(currentEditor);
    },
  });
  editorRef.current = editor;

  const syncSlashMenu = (currentEditor: Editor) => {
    const previous = slashRef.current;
    if (previous) {
      if (!slashAnchorIsAlive(currentEditor, previous.from)) setSlash(null);
      return;
    }
    const next = slashContext(currentEditor);
    if (next) setSlash({ ...next, index: -1, subIndex: -1, submenuId: null });
  };

  useEffect(() => {
    if (!editor) return;
    const noteId = bundle.note.id;
    const incoming = documentForBundle(bundle);
    const signature = docSignature(incoming);

    if (lastNoteId.current === null) {
      lastNoteId.current = noteId;
      lastDocSignature.current = signature;
      return;
    }

    if (lastNoteId.current === noteId && signature === lastDocSignature.current) return;

    if (lastNoteId.current === noteId && selfSignatures.current.has(signature)) {
      // This is the store echoing a snapshot this editor already produced.
      // It is not an external replacement, even when several echoes overlap.
      return;
    }

    if (lastNoteId.current === noteId) {
      // Same note, different document: an explicit external replacement
      // (AI, import, structural action). Pending keystrokes must not be
      // written back over the newer document.
      cancelPendingChange();
    } else {
      // Flush to the note that owned the pending edits before switching.
      void commitPendingChange();
      selfSignatures.current.clear();
    }

    editor.commands.setContent(incoming as any, { emitUpdate: false });
    lastNoteId.current = noteId;
    lastDocSignature.current = docSignature(editor.getJSON());
    setSlash(null);
  }, [editor, bundle]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  useEffect(() => {
    if (!editor || !import.meta.env.DEV) return;
    (window as any).__riverEditor = editor;
  }, [editor]);

  useEffect(() => () => { void commitPendingChange(); }, []);

  useEffect(() => {
    const flushBeforeUnload = () => { void commitPendingChange(); };
    window.addEventListener("beforeunload", flushBeforeUnload);
    return () => window.removeEventListener("beforeunload", flushBeforeUnload);
  }, []);

  useEffect(() => {
    registerFlush?.(commitPendingChange);
    const unregister = registerEditorFlush(commitPendingChange);
    return () => {
      registerFlush?.(null);
      unregister();
    };
  }, [registerFlush, bundle.note.id]);

  if (!editor) return <div className="river-empty">正在加载编辑器…</div>;

  const wrapSelection = (marker: string) => {
    const { from, to } = editor.state.selection;
    const selected = editor.state.doc.textBetween(from, to, "\n");
    const next = `${marker}${selected}${marker}`;
    editor.chain().focus().insertContentAt({ from, to }, next).setTextSelection(from + marker.length + selected.length).run();
  };

  const setHeading = (level: 0 | 1 | 2 | 3 | 4 | 5 | 6) => {
    editor.chain().focus().updateAttributes("listItem", {
      itemType: "knowledge",
      headingLevel: level,
      markerVisible: false,
      userModified: true,
      updatedAt: new Date().toISOString(),
    }).run();
  };

  const runSlashAction = (item: SlashMenuItem, subItem?: SlashSubItem) => {
    const current = slashRef.current;
    if (!current) return;
    setSlash(null);
    editor.chain().focus().deleteRange({ from: current.from, to: current.from + 1 }).run();
    if (subItem) subItem.run(editor);
    else item.run?.(editor);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const native = event.nativeEvent as KeyboardEvent & { isComposing?: boolean };
    if (native.isComposing || native.keyCode === 229) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, select, [contenteditable='false']")) return;

    const menu = slashRef.current;
    if (menu) {
      const active = menu.index >= 0 ? SLASH_NAV_ITEMS[menu.index] : null;
      const submenu = active?.children?.length && menu.submenuId === active.id ? active.children : null;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        const delta = event.key === "ArrowDown" ? 1 : -1;
        if (submenu) {
          const subIndex = ((menu.subIndex + delta) % submenu.length + submenu.length) % submenu.length;
          setSlash({ ...menu, subIndex });
        } else if (SLASH_NAV_ITEMS.length) {
          const index = ((Math.max(menu.index, -1) + delta) % SLASH_NAV_ITEMS.length + SLASH_NAV_ITEMS.length) % SLASH_NAV_ITEMS.length;
          const item = SLASH_NAV_ITEMS[index];
          setSlash({ ...menu, index, subIndex: -1, submenuId: item.children ? item.id : null });
        }
        return;
      }
      if (event.key === "ArrowRight" && active?.children) {
        event.preventDefault();
        event.stopPropagation();
        setSlash({ ...menu, submenuId: active.id, subIndex: menu.subIndex < 0 ? 0 : menu.subIndex });
        return;
      }
      if (event.key === "ArrowLeft" && menu.submenuId) {
        event.preventDefault();
        event.stopPropagation();
        setSlash({ ...menu, submenuId: null, subIndex: -1 });
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        if (active?.children?.length) {
          const child = active.children[Math.max(0, menu.subIndex)];
          if (menu.submenuId === active.id && child) runSlashAction(active, child);
          else setSlash({ ...menu, submenuId: active.id, subIndex: 0 });
        } else if (active?.run) {
          runSlashAction(active);
        } else {
          setSlash(null);
        }
        return;
      }
      if (event.key === "Escape" || event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        setSlash(null);
        return;
      }
    }

    if (event.key === "Escape" && focusMode) {
      event.preventDefault();
      event.stopPropagation();
      onToggleFocus();
      return;
    }
    // Tab, Enter and structural deletion are handled by the ProseMirror
    // plugin in extensions.tsx. That pipeline runs after EditorView flushes
    // pending DOM input and selection changes, so it never acts on a stale
    // caret. This React listener only owns menu and shell interactions.
  };

  const renameRootTitle = (nextTitle: string): boolean => {
    const currentEditor = editorRef.current;
    if (!currentEditor) return false;
    const { state } = currentEditor;
    let rootPos: number | null = null;
    state.doc.descendants((node, pos) => {
      if (node.type.name === "listItem"
        && node.attrs.itemType === "knowledge"
        && node.attrs.nodeType === "root") {
        rootPos = pos;
        return false;
      }
      return true;
    });
    if (rootPos === null) return false;
    const item = state.doc.nodeAt(rootPos);
    const paragraph = item?.firstChild;
    if (!item || !paragraph || paragraph.type.name !== "paragraph") return false;
    const from = rootPos + 2;
    const to = from + paragraph.content.size;
    if (state.doc.textBetween(from, to, "\n") === nextTitle) return true;
    const transaction = state.tr.insertText(nextTitle, from, to);
    currentEditor.view.dispatch(transaction);
    return true;
  };

  useEffect(() => {
    if (!editor) return;
    return registerEditorTitleRenamer(renameRootTitle);
  }, [editor]);

  return (
    <div className={`river-outline-editor-shell ${focusMode ? "is-focus" : ""} ${compact ? "is-compact" : ""}`} data-testid="river-outline-shell">
      <div className="river-outline-toolbar">
        <div className="river-chip-row">
          <button className="river-chip" onClick={() => editor.chain().focus().undo().run()} title="撤销（⌘Z）">撤销</button>
          <button className="river-chip" onClick={() => editor.chain().focus().redo().run()} title="重做（⇧⌘Z）">重做</button>
          <select
            className="river-chip river-heading-select"
            value={editor.getAttributes("listItem").headingLevel || 0}
            onChange={(event) => setHeading(Number(event.target.value) as 0 | 1 | 2 | 3 | 4 | 5 | 6)}
            title="标题层级"
          >
            <option value={0}>正文</option>
            <option value={1}>H1</option>
            <option value={2}>H2</option>
            <option value={3}>H3</option>
            <option value={4}>H4</option>
            <option value={5}>H5</option>
            <option value={6}>H6</option>
          </select>
          <button className="river-chip" onClick={() => wrapSelection("**")} title="粉色强调：**文字**">**</button>
          <button className="river-chip" onClick={() => wrapSelection("*")} title="金色斜体：*文字*">*</button>
          <button className="river-chip" onClick={() => wrapSelection("::")} title="黄色标注：::文字::">::</button>
          <button className="river-chip" onClick={() => wrapSelection("++")} title="评论：++文字++">++</button>
          <button className="river-chip" onClick={() => wrapSelection("~~")} title="删除线：~~文字~~">~~</button>
          <button className="river-chip" onClick={() => wrapSelection("`")} title="行内代码：`文字`">`</button>
        </div>
        <button className="river-button river-focus-button" onClick={onToggleFocus} title={focusMode ? "退出专注模式（Esc）" : "当前笔记进入专注模式"}>
          <Icon name={focusMode ? "collapse" : "expand"} />
          {focusMode ? "恢复布局" : "专注"}
        </button>
      </div>
      <div
        className="river-outline-canvas"
        data-testid="river-outline-canvas"
        onKeyDownCapture={handleKeyDown}
        onBlur={(event) => {
          const nextTarget = event.relatedTarget as Node | null;
          if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
            setSlash(null);
            void commitPendingChange();
          }
        }}
      >
        <EditorContent editor={editor} />
        {slash && (
          <div
            className={`river-slash-menu ${slash.left > 360 ? "submenu-left" : ""}`}
            data-testid="river-slash-menu"
            style={{ left: slash.left, top: slash.top }}
            role="menu"
            aria-label="Effie 快捷菜单"
          >
            {SLASH_SECTIONS.map((section) => (
              <div key={section.id} className={`river-slash-section is-${section.layout}`}>
                {section.layout === "rows" ? section.items.map((item) => {
                  const itemIndex = SLASH_NAV_ITEMS.indexOf(item);
                  const active = slash.index === itemIndex;
                  const submenuOpen = slash.submenuId === item.id && Boolean(item.children?.length);
                  return (
                    <div className="river-slash-row-wrap" key={item.id}>
                      <button
                        type="button"
                        role="menuitem"
                        aria-haspopup={item.children ? "menu" : undefined}
                        aria-expanded={item.children ? submenuOpen : undefined}
                        className={`river-slash-row ${active ? "is-active" : ""}`}
                        data-testid={`river-slash-${item.id}`}
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setSlash((current) => current ? {
                          ...current,
                          index: itemIndex,
                          subIndex: -1,
                          submenuId: item.children ? item.id : null,
                        } : current)}
                        onClick={() => {
                          if (item.children) {
                            setSlash((current) => current ? { ...current, index: itemIndex, submenuId: item.id, subIndex: -1 } : current);
                          } else {
                            runSlashAction(item);
                          }
                        }}
                      >
                        <SlashMenuIcon name={item.icon} />
                        <span className="river-slash-label">{item.label}</span>
                        {item.trailing && <span className="river-slash-trailing">{item.trailing === "chevron" ? "›" : "↵"}</span>}
                      </button>
                      {submenuOpen && item.children && (
                        <div className="river-slash-submenu" role="menu" aria-label={item.label}>
                          {item.children.map((child, index) => (
                            <button
                              key={child.id}
                              type="button"
                              role="menuitem"
                              className={`river-slash-subitem ${slash.subIndex === index ? "is-active" : ""}`}
                              onMouseDown={(event) => event.preventDefault()}
                              onMouseEnter={() => setSlash((current) => current ? { ...current, subIndex: index } : current)}
                              onClick={() => runSlashAction(item, child)}
                            >
                              <SlashMenuIcon name={child.id.includes("ai") ? "sparkles" : "wand"} />
                              <span>{child.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }) : (
                  <div className="river-slash-grid">
                    {section.items.map((item) => {
                      const itemIndex = SLASH_NAV_ITEMS.indexOf(item);
                      const active = slash.index === itemIndex;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="menuitem"
                          className={`river-slash-grid-button ${active ? "is-active" : ""}`}
                          data-testid={`river-slash-${item.id}`}
                          aria-label={item.label}
                          title={item.label}
                          onMouseDown={(event) => event.preventDefault()}
                          onMouseEnter={() => setSlash((current) => current ? { ...current, index: itemIndex, subIndex: -1, submenuId: null } : current)}
                          onClick={() => runSlashAction(item)}
                        >
                          <SlashMenuIcon name={item.icon} />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function slashContext(editor: Editor): Omit<SlashState, "index" | "subIndex" | "submenuId"> | null {
  const { state } = editor;
  if (!state.selection.empty) return null;
  const $from = state.doc.resolve(state.selection.from);
  if ($from.parent.type.name !== "paragraph") return null;
  if ($from.parentOffset <= 0) return null;
  const textBefore = $from.parent.textBetween(0, $from.parentOffset, "\n", "\0");
  if (!textBefore.endsWith("/")) return null;

  const from = state.selection.from - 1;
  const canvas = editor.view.dom.closest(".river-outline-canvas") as HTMLElement | null;
  if (!canvas) return null;
  const coords = editor.view.coordsAtPos(from);
  const bounds = canvas.getBoundingClientRect();
  const estimatedHeight = 590;
  const preferredTop = coords.bottom - bounds.top + canvas.scrollTop + 6;
  const top = preferredTop + estimatedHeight > canvas.scrollTop + canvas.clientHeight
    ? Math.max(canvas.scrollTop + 6, coords.top - bounds.top + canvas.scrollTop - estimatedHeight - 6)
    : preferredTop;
  return {
    from,
    to: state.selection.from,
    left: Math.max(8, Math.min(coords.left - bounds.left + canvas.scrollLeft, canvas.clientWidth - 326)),
    top,
  };
}

function slashAnchorIsAlive(editor: Editor, from: number): boolean {
  const { state } = editor;
  try {
    if (state.doc.textBetween(from, from + 1) !== "/") return false;
    const $from = state.doc.resolve(state.selection.from);
    let depth = $from.depth;
    while (depth > 0 && !$from.node(depth).isTextblock) depth -= 1;
    if (depth === 0) return false;
    return from >= $from.start(depth) && from < $from.end(depth);
  } catch {
    return false;
  }
}

function syncSelectionDebug(editor: Editor) {
  if (!import.meta.env.DEV) return;
  try {
    const dom = editor.view.dom as HTMLElement;
    const from = editor.state.selection.from;
    dom.setAttribute("data-pm-selection", String(from));
    const $from = editor.state.doc.resolve(from);
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      const node = $from.node(depth);
      if (node.type.name !== "listItem") continue;
      dom.setAttribute("data-pm-item", node.textContent.slice(0, 80));
      return;
    }
    dom.removeAttribute("data-pm-item");
  } catch {
    // Debug attributes are optional.
  }
}
