import { create } from "zustand";
import { nanoid } from "nanoid";
import {
  createFolder,
  createNote,
  db,
  deleteFolder,
  duplicateNote,
  ensureSeedData,
  getNoteBundle,
  getLearningMaps,
  getSetting,
  listActiveNotes,
  listDeletedNotes,
  moveNoteToFolder,
  moveFolder,
  permanentlyDeleteFolder,
  permanentlyDeleteNote,
  renameFolder,
  replaceKnowledgeTree,
  restoreNote,
  restoreFolder,
  searchNotes,
  setSetting,
  softDeleteNote,
  updateNote,
  upsertIntroduction,
  upsertLearningProfile,
  upsertSourceDocument,
  upsertLearningMap,
  recordAIRequest,
  touchNoteLastOpened,
} from "../db/database";
import type {
  AIProvider,
  ContentBlock,
  ContentBlockType,
  EditorDocumentSnapshot,
  Folder,
  KnowledgeNode,
  LearningIntroduction,
  LearningMap,
  LearningProfile,
  Note,
  NoteBundle,
  SourceDocument,
  UIStyle,
} from "../types";
import { addChildNode, addNodeAfter, deleteNode, flattenTree, indentNode, moveNode, outdentNode, buildTree } from "../services/tree";
import {
  CC_SWITCH_LOCAL_KEY,
  cancelFullLearningPackage,
  expandNode,
  generateFullLearningPackage,
  generateOpening,
  generateTree,
  getActiveFullLearningPackageJob,
  regenerateBlock,
  simplifyBlock,
  validateKey,
  waitForFullLearningPackage,
  type AIResponse,
  type FullLearningPackageData,
  type GenerationJob,
} from "../services/aiClient";
import { parseCourseware, sourceToText } from "../services/uploadService";
import { createBackupPayload, restoreBackupPayload } from "../db/backup";
import { composeLearningOpeningOutline } from "../services/learningOpeningOutline";
import { buildCompanionMaps } from "../services/companionCopy";
import { nodesToTiptap, tiptapToNodes } from "../editor/convert";
import { flushActiveEditor, renameActiveEditorTitle } from "../editor/editorFlush";
import { clearEditorSnapshot, readEditorSnapshot, readEditorSnapshotRecord } from "../editor/snapshotCache";
import { adoptServerWorkspaceRevision, flushWorkspace, scheduleWorkspaceSync } from "../services/workspaceSync";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface ToastMessage {
  id: string;
  message: string;
  type: "info" | "error" | "success";
}

export interface PendingAIResult {
  kind: "regenerate" | "simplify" | "expand";
  nodeId: string;
  blockId?: string;
  text?: string;
  rationale?: string;
  explanation?: string;
  children?: Array<{ title: string; blocks: Array<{ type: ContentBlockType; text: string; sourceRefs: any[] }> }>;
  baseRevision?: string;
  baseText?: string;
  requestedAt?: string;
  conflict?: boolean;
}

interface AppState {
  bootstrapped: boolean;
  folders: Folder[];
  notes: Note[];
  deletedNotes: Note[];
  bundle: NoteBundle | null;
  uiStyle: UIStyle;
  searchQuery: string;
  activeNoteId: string | null;
  selectedNodeId: string | null;
  selectedBlockId: string | null;
  provider: AIProvider;
  openaiApiKey: string;
  deepseekApiKey: string;
  opencodeGoApiKey: string;
  ccSwitchKeyEnabled: boolean;
  model: string;
  focusMode: boolean;
  saveStatus: SaveStatus;
  saveError: string | null;
  isGenerating: boolean;
  generationNoteId: string | null;
  generationMessage: string;
  generationProgress: number;
  generationStage: string;
  generationPageRange: string | null;
  generationTotalPages: number;
  generationSectionTitle: string | null;
  generationCurrentFile: string | null;
  toast: ToastMessage | null;
  pendingAI: PendingAIResult | null;
  history: Array<{ nodes: KnowledgeNode[]; blocks: ContentBlock[] }>;
  future: Array<{ nodes: KnowledgeNode[]; blocks: ContentBlock[] }>;
  bootstrap: () => Promise<void>;
  refreshLibrary: () => Promise<void>;
  setUIStyle: (style: UIStyle) => Promise<void>;
  setSearchQuery: (query: string) => Promise<void>;
  createFolderAction: (name: string, parentId?: string | null) => Promise<void>;
  renameFolderAction: (folderId: string, name: string) => Promise<void>;
  deleteFolderAction: (folderId: string) => Promise<void>;
  restoreFolderAction: (folderId: string) => Promise<void>;
  permanentlyDeleteFolderAction: (folderId: string) => Promise<void>;
  moveFolderAction: (folderId: string, parentId: string | null, order: number) => Promise<void>;
  createNoteAction: (folderId: string | null) => Promise<string>;
  openNote: (noteId: string) => Promise<void>;
  closeNote: () => void;
  updateNoteTitleAction: (title: string) => Promise<void>;
  deleteNoteAction: (noteId: string) => Promise<void>;
  restoreNoteAction: (noteId: string) => Promise<void>;
  moveNoteAction: (noteId: string, folderId: string | null) => Promise<void>;
  renameNoteAction: (noteId: string, title: string) => Promise<void>;
  toggleFavoriteAction: (noteId: string) => Promise<void>;
  togglePinnedAction: (noteId: string) => Promise<void>;
  duplicateNoteAction: (noteId: string) => Promise<string | null>;
  permanentlyDeleteNoteAction: (noteId: string) => Promise<void>;
  updateNodeTitle: (nodeId: string, title: string) => void;
  updateBlockText: (blockId: string, text: string) => void;
  updateBlockType: (blockId: string, type: ContentBlockType) => void;
  addNodeAfterAction: (nodeId: string) => void;
  addChildNodeAction: (nodeId: string) => void;
  indentAction: (nodeId: string) => void;
  outdentAction: (nodeId: string) => void;
  moveNodeAction: (nodeId: string, direction: -1 | 1) => void;
  deleteNodeAction: (nodeId: string) => void;
  toggleCollapseAction: (nodeId: string) => void;
  addBlockAction: (nodeId: string, type?: ContentBlockType) => void;
  deleteBlockAction: (blockId: string) => void;
  selectNode: (nodeId: string | null, blockId?: string | null) => void;
  undo: () => void;
  redo: () => void;
  setProvider: (provider: AIProvider) => Promise<void>;
  setOpenAIKey: (key: string) => void;
  setDeepseekKey: (key: string) => void;
  setOpenCodeGoKey: (key: string) => void;
  setCcSwitchKeyEnabled: (enabled: boolean) => Promise<void>;
  clearCurrentKey: () => void;
  validateApiKeyAction: () => Promise<boolean>;
  setModel: (model: string) => Promise<void>;
  attachCourseware: (file: File) => Promise<SourceDocument | null>;
  deleteSourceAction: (sourceId: string) => Promise<void>;
  reorderSourcesAction: (sourceIds: string[]) => Promise<void>;
  saveLearningMapAction: (map: LearningMap) => Promise<void>;
  saveLearningProfile: (profile: LearningProfile) => Promise<void>;
  materializeLearningOpeningAction: () => Promise<void>;
  generateOpeningAction: () => Promise<void>;
  generateTreeAction: () => Promise<void>;
  resumeGenerationForNote: (noteId: string) => Promise<void>;
  runRegenerate: (nodeId: string, blockId: string) => Promise<void>;
  runSimplify: (nodeId: string, blockId: string) => Promise<void>;
  runExpand: (nodeId: string) => Promise<void>;
  applyPendingAI: () => Promise<void>;
  forceApplyPendingAI: () => Promise<void>;
  discardPendingAI: () => void;
  exportBackup: () => Promise<void>;
  importBackup: (file: File) => Promise<void>;
  generateLargeTestTree: (count?: number) => Promise<void>;
  toggleFocusMode: () => void;
  setFocusMode: (value: boolean) => void;
  updateBundleTree: (noteId: string, nodes: KnowledgeNode[], blocks: ContentBlock[], editorDoc: EditorDocumentSnapshot) => Promise<void>;
  saveInlineTree: (noteId: string, nodes: KnowledgeNode[], blocks: ContentBlock[], editorDoc: EditorDocumentSnapshot) => Promise<void>;
  showToast: (message: string, type?: ToastMessage["type"]) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let inlineTreeSaveQueue: Promise<void> = Promise.resolve();

function iso() {
  return new Date().toISOString();
}

function currentApiKey(state: Pick<AppState, "provider" | "openaiApiKey" | "deepseekApiKey" | "opencodeGoApiKey" | "ccSwitchKeyEnabled">): string {
  if (state.provider === "opencode-go" && state.ccSwitchKeyEnabled) return CC_SWITCH_LOCAL_KEY;
  if (state.provider === "deepseek") return state.deepseekApiKey;
  if (state.provider === "opencode-go") return state.opencodeGoApiKey;
  return state.openaiApiKey;
}

function providerDisplayName(provider: AIProvider): string {
  if (provider === "deepseek") return "卡扣 AI";
  if (provider === "opencode-go") return "OpenCode Go";
  return "OpenAI";
}

function localCcSwitchDefault(): boolean {
  return typeof location !== "undefined" && ["127.0.0.1", "localhost"].includes(location.hostname);
}

function defaultModelFor(provider: AIProvider): string {
  if (provider === "deepseek") return "deepseek-v4.1-flash";
  if (provider === "opencode-go") return "deepseek-v4.1-flash";
  return "gpt-6-luna";
}

function pushHistory(state: Pick<AppState, "history" | "future" | "bundle">) {
  if (!state.bundle) return { history: state.history, future: state.future };
  return {
    history: [...state.history.slice(-49), { nodes: state.bundle.nodes, blocks: state.bundle.blocks }],
    future: [],
  };
}

function enqueueTreeSave(
  noteId: string,
  nodes: KnowledgeNode[],
  blocks: ContentBlock[],
  editorDoc: EditorDocumentSnapshot,
): Promise<void> {
  const task = inlineTreeSaveQueue.catch(() => undefined).then(async () => {
    try {
      await replaceKnowledgeTree(noteId, nodes, blocks, editorDoc);
      clearEditorSnapshot(noteId, editorDoc);
    } catch (error) {
      throw error;
    }
  });
  inlineTreeSaveQueue = task;
  return task;
}

/**
 * External writers (AI, import, structural actions) do not have a live
 * ProseMirror document. Build the complete snapshot from their projection and
 * persist it together with the nodes and blocks so the note has one
 * authoritative body afterwards.
 */
async function writeExternalTree(
  noteId: string,
  nodes: KnowledgeNode[],
  blocks: ContentBlock[],
): Promise<EditorDocumentSnapshot> {
  const editorDoc = nodesToTiptap(nodes, blocks);
  // AI, import and structural writers replace the body wholesale; any cached
  // snapshot belongs to the previous body and must not be replayed later.
  clearEditorSnapshot(noteId);
  await enqueueTreeSave(noteId, nodes, blocks, editorDoc);
  return editorDoc;
}

export const useAppStore = create<AppState>((set, get) => ({
  bootstrapped: false,
  folders: [],
  notes: [],
  deletedNotes: [],
  bundle: null,
  uiStyle: "effie",
  searchQuery: "",
  activeNoteId: null,
  selectedNodeId: null,
  selectedBlockId: null,
  provider: "openai",
  openaiApiKey: "",
  deepseekApiKey: "",
  opencodeGoApiKey: "",
  ccSwitchKeyEnabled: localCcSwitchDefault(),
  model: "gpt-6-luna",
  focusMode: false,
  saveStatus: "idle",
  saveError: null,
  isGenerating: false,
  generationNoteId: null,
  generationMessage: "",
  generationProgress: 0,
  generationStage: "",
  generationPageRange: null,
  generationTotalPages: 0,
  generationSectionTitle: null,
  generationCurrentFile: null,
  toast: null,
  pendingAI: null,
  history: [],
  future: [],

  bootstrap: async () => {
    await ensureSeedData();
    const [folders, notes, deletedNotes, style, provider, storedModel, ccSwitchKeyEnabled] = await Promise.all([
      db.folders.toArray(),
      listActiveNotes(),
      listDeletedNotes(),
      getSetting<UIStyle>("uiStyle", "effie"),
      getSetting<AIProvider>("provider", "openai"),
      getSetting<string>("model", "gpt-6-luna"),
      getSetting<boolean>("ccSwitchKeyEnabled", localCcSwitchDefault()),
    ]);
    const model = provider === "deepseek" && storedModel === "deepseek-flash"
      ? defaultModelFor(provider)
      : storedModel || defaultModelFor(provider);
    set({ folders, notes, deletedNotes, uiStyle: style, provider, model, ccSwitchKeyEnabled, bootstrapped: true });
  },

  refreshLibrary: async () => {
    const [folders, notes, deletedNotes] = await Promise.all([
      db.folders.toArray(),
      get().searchQuery ? searchNotes(get().searchQuery) : listActiveNotes(),
      listDeletedNotes(),
    ]);
    set({ folders, notes, deletedNotes });
  },

  setUIStyle: async (style) => {
    set({ uiStyle: style });
    await setSetting("uiStyle", style);
    if (get().bundle) {
      await updateNote(get().bundle!.note.id, { uiStyle: style });
      set((state) => state.bundle ? { bundle: { ...state.bundle, note: { ...state.bundle.note, uiStyle: style } } } : {});
    }
  },

  setSearchQuery: async (query) => {
    set({ searchQuery: query });
    const notes = query.trim() ? await searchNotes(query) : await listActiveNotes();
    set({ notes });
  },

  createFolderAction: async (name, parentId = null) => {
    await createFolder(name, parentId);
    await get().refreshLibrary();
  },

  renameFolderAction: async (folderId, name) => {
    await renameFolder(folderId, name);
    await get().refreshLibrary();
  },

  deleteFolderAction: async (folderId) => {
    const result = await deleteFolder(folderId);
    await get().refreshLibrary();
    get().showToast(`已将 ${result.foldersDeleted} 个文件夹和 ${result.notesMoved} 篇笔记移入最近删除。`, "info");
  },

  restoreFolderAction: async (folderId) => {
    await restoreFolder(folderId);
    await get().refreshLibrary();
  },

  permanentlyDeleteFolderAction: async (folderId) => {
    await permanentlyDeleteFolder(folderId);
    await get().refreshLibrary();
  },

  moveFolderAction: async (folderId, parentId, order) => {
    await moveFolder(folderId, parentId, order);
    await get().refreshLibrary();
  },

  createNoteAction: async (folderId) => {
    const note = await createNote(folderId, "新建学习笔记", get().uiStyle);
    await get().refreshLibrary();
    await get().openNote(note.id);
    return note.id;
  },

  openNote: async (noteId) => {
    await inlineTreeSaveQueue.catch(() => undefined);
    await touchNoteLastOpened(noteId);
    const bundle = await getNoteBundle(noteId);
    if (!bundle) return;
    const cachedRecord = readEditorSnapshotRecord(noteId);
    const cached = cachedRecord?.editorDoc;
    const databaseUpdatedAt = Date.parse(bundle.note.updatedAt);
    const cacheIsNewer = Boolean(cachedRecord && Number.isFinite(databaseUpdatedAt) && cachedRecord.savedAt > databaseUpdatedAt);
    if (cached && cachedRecord && !cacheIsNewer) {
      clearEditorSnapshot(noteId);
    } else if (cached && JSON.stringify(cached) !== JSON.stringify(bundle.note.editorDoc)) {
      // The browser left before the IndexedDB write finished. Recover the
      // newer document from the synchronous cache and repair the database.
      const recovered = tiptapToNodes(cached as any, noteId);
      bundle.note = { ...bundle.note, editorDoc: cached };
      bundle.nodes = recovered.nodes;
      bundle.blocks = recovered.blocks;
      await enqueueTreeSave(noteId, recovered.nodes, recovered.blocks, cached);
    }
    set({
      bundle,
      uiStyle: bundle.note.uiStyle,
      activeNoteId: noteId,
      selectedNodeId: bundle.nodes[0]?.id || null,
      selectedBlockId: bundle.blocks.find((block) => block.nodeId === bundle.nodes[0]?.id)?.id || null,
      history: [],
      future: [],
    });
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem("river.active-note", noteId);
    void get().resumeGenerationForNote(noteId);
  },

  closeNote: () => {
    if (typeof sessionStorage !== "undefined") sessionStorage.removeItem("river.active-note");
    set({ bundle: null, activeNoteId: null, selectedNodeId: null, selectedBlockId: null, pendingAI: null, focusMode: false });
  },

  updateNoteTitleAction: async (title) => {
    const bundle = get().bundle;
    if (!bundle) return;
    const nextTitle = title.trim() || "未命名笔记";

    // The toolbar title and the root outline item are two views of the same
    // document title. Rename through the editor, flush that transaction, then
    // patch note metadata only, so the editor's authoritative body is never
    // replaced by a stale bundle.
    renameActiveEditorTitle(nextTitle);
    await flushActiveEditor();

    await updateNote(bundle.note.id, { title: nextTitle });
    const current = get().bundle;
    if (current?.note.id === bundle.note.id) {
      set({
        bundle: {
          ...current,
          note: { ...current.note, title: nextTitle, updatedAt: iso() },
        },
      });
    }
    await get().refreshLibrary();
  },

  deleteNoteAction: async (noteId) => {
    await cancelFullLearningPackage(noteId).catch(() => undefined);
    await softDeleteNote(noteId);
    if (get().activeNoteId === noteId) get().closeNote();
    await get().refreshLibrary();
  },

  restoreNoteAction: async (noteId) => {
    await restoreNote(noteId);
    await get().refreshLibrary();
  },

  moveNoteAction: async (noteId, folderId) => {
    await moveNoteToFolder(noteId, folderId);
    await get().refreshLibrary();
  },

  renameNoteAction: async (noteId, title) => {
    await updateNote(noteId, { title: title.trim() || "未命名笔记" });
    await get().refreshLibrary();
  },

  toggleFavoriteAction: async (noteId) => {
    const note = await db.notes.get(noteId);
    if (!note) return;
    await updateNote(noteId, { favorite: !note.favorite });
    await get().refreshLibrary();
  },

  togglePinnedAction: async (noteId) => {
    const note = await db.notes.get(noteId);
    if (!note) return;
    await updateNote(noteId, { pinned: !note.pinned });
    await get().refreshLibrary();
  },

  duplicateNoteAction: async (noteId) => {
    const copy = await duplicateNote(noteId);
    await get().refreshLibrary();
    return copy?.id || null;
  },

  permanentlyDeleteNoteAction: async (noteId) => {
    await cancelFullLearningPackage(noteId).catch(() => undefined);
    await permanentlyDeleteNote(noteId);
    await get().refreshLibrary();
  },

  updateNodeTitle: (nodeId, title) => {
    const bundle = get().bundle;
    if (!bundle) return;
    set({
      ...pushHistory({ history: get().history, future: get().future, bundle }),
      bundle: {
        ...bundle,
        nodes: bundle.nodes.map((node) => node.id === nodeId ? { ...node, title, updatedAt: iso(), userModified: true } : node),
      },
    });
    scheduleSave(get, set);
  },

  updateBlockText: (blockId, text) => {
    const bundle = get().bundle;
    if (!bundle) return;
    set({
      ...pushHistory({ history: get().history, future: get().future, bundle }),
      bundle: {
        ...bundle,
        blocks: bundle.blocks.map((block) => block.id === blockId ? { ...block, text, updatedAt: iso(), userModified: true } : block),
      },
    });
    scheduleSave(get, set);
  },

  updateBlockType: (blockId, type) => {
    const bundle = get().bundle;
    if (!bundle) return;
    set({
      ...pushHistory({ history: get().history, future: get().future, bundle }),
      bundle: {
        ...bundle,
        blocks: bundle.blocks.map((block) => block.id === blockId ? { ...block, type, updatedAt: iso(), userModified: true } : block),
      },
    });
    scheduleSave(get, set);
  },

  addNodeAfterAction: (nodeId) => {
    const bundle = get().bundle;
    if (!bundle) return;
    const { node, block } = addNodeAfter(bundle.nodes, bundle.blocks, nodeId);
    set({
      ...pushHistory({ history: get().history, future: get().future, bundle }),
      bundle: { ...bundle, nodes: [...bundle.nodes, node], blocks: [...bundle.blocks, block] },
      selectedNodeId: node.id,
      selectedBlockId: block.id,
    });
    scheduleSave(get, set);
  },

  addChildNodeAction: (nodeId) => {
    const bundle = get().bundle;
    if (!bundle) return;
    const { node, block } = addChildNode(bundle.nodes, bundle.blocks, nodeId);
    set({
      ...pushHistory({ history: get().history, future: get().future, bundle }),
      bundle: { ...bundle, nodes: [...bundle.nodes, node], blocks: [...bundle.blocks, block] },
      selectedNodeId: node.id,
      selectedBlockId: block.id,
    });
    scheduleSave(get, set);
  },

  indentAction: (nodeId) => {
    const bundle = get().bundle;
    if (!bundle) return;
    set({
      ...pushHistory({ history: get().history, future: get().future, bundle }),
      bundle: { ...bundle, nodes: indentNode(bundle.nodes, nodeId) },
    });
    scheduleSave(get, set);
  },

  outdentAction: (nodeId) => {
    const bundle = get().bundle;
    if (!bundle) return;
    set({
      ...pushHistory({ history: get().history, future: get().future, bundle }),
      bundle: { ...bundle, nodes: outdentNode(bundle.nodes, nodeId) },
    });
    scheduleSave(get, set);
  },

  moveNodeAction: (nodeId, direction) => {
    const bundle = get().bundle;
    if (!bundle) return;
    set({
      ...pushHistory({ history: get().history, future: get().future, bundle }),
      bundle: { ...bundle, nodes: moveNode(bundle.nodes, nodeId, direction) },
    });
    scheduleSave(get, set);
  },

  deleteNodeAction: (nodeId) => {
    const bundle = get().bundle;
    if (!bundle) return;
    const result = deleteNode(bundle.nodes, bundle.blocks, nodeId);
    set({
      ...pushHistory({ history: get().history, future: get().future, bundle }),
      bundle: { ...bundle, nodes: result.nodes, blocks: result.blocks },
      selectedNodeId: result.nodes[0]?.id || null,
      selectedBlockId: result.blocks[0]?.id || null,
    });
    scheduleSave(get, set);
  },

  toggleCollapseAction: (nodeId) => {
    const bundle = get().bundle;
    if (!bundle) return;
    set({
      bundle: {
        ...bundle,
        nodes: bundle.nodes.map((node) => node.id === nodeId ? { ...node, collapsed: !node.collapsed, updatedAt: iso() } : node),
      },
    });
    scheduleSave(get, set);
  },

  addBlockAction: (nodeId, type = "explanation") => {
    const bundle = get().bundle;
    if (!bundle) return;
    const createdAt = iso();
    const block: ContentBlock = {
      id: nanoid(),
      nodeId,
      noteId: bundle.note.id,
      order: bundle.blocks.filter((item) => item.nodeId === nodeId).length,
      type,
      text: "",
      sourceRefs: [],
      userModified: true,
      createdAt,
      updatedAt: createdAt,
    };
    set({
      ...pushHistory({ history: get().history, future: get().future, bundle }),
      bundle: { ...bundle, blocks: [...bundle.blocks, block] },
      selectedNodeId: nodeId,
      selectedBlockId: block.id,
    });
    scheduleSave(get, set);
  },

  deleteBlockAction: (blockId) => {
    const bundle = get().bundle;
    if (!bundle) return;
    set({
      ...pushHistory({ history: get().history, future: get().future, bundle }),
      bundle: { ...bundle, blocks: bundle.blocks.filter((block) => block.id !== blockId) },
      selectedBlockId: null,
    });
    scheduleSave(get, set);
  },

  selectNode: (nodeId, blockId = null) => set({ selectedNodeId: nodeId, selectedBlockId: blockId }),

  toggleFocusMode: () => set((state) => ({ focusMode: !state.focusMode })),
  setFocusMode: (value) => set({ focusMode: value }),

  updateBundleTree: async (noteId, nodes, blocks, editorDoc) => {
    const bundle = get().bundle;
    if (bundle?.note.id === noteId) {
      set({
        bundle: {
          ...bundle,
          note: {
            ...bundle.note,
            editorDoc,
            revision: (bundle.note.revision || 0) + 1,
            updatedAt: iso(),
          },
          nodes,
          blocks,
        },
      });
    }
    set({ saveStatus: "saving" });
    try {
      await enqueueTreeSave(noteId, nodes, blocks, editorDoc);
      if (get().bundle?.note.id === noteId) set({ saveStatus: "saved", saveError: null });
    } catch (error) {
      if (get().bundle?.note.id === noteId) {
        set({ saveStatus: "error", saveError: error instanceof Error ? error.message : "保存失败。" });
      }
    }
  },

  saveInlineTree: async (noteId, nodes, blocks, editorDoc) => {
    set({ saveStatus: "saving" });
    await enqueueTreeSave(noteId, nodes, blocks, editorDoc);
    const bundle = get().bundle;
    if (bundle?.note.id === noteId) {
      set({
        bundle: {
          ...bundle,
          note: {
            ...bundle.note,
            editorDoc,
            revision: (bundle.note.revision || 0) + 1,
            updatedAt: iso(),
          },
          nodes,
          blocks,
        },
      });
    }
    set({ saveStatus: "saved", saveError: null });
    await get().refreshLibrary();
  },

  undo: () => {
    const state = get();
    if (!state.bundle || state.history.length === 0) return;
    const previous = state.history[state.history.length - 1];
    set({
      history: state.history.slice(0, -1),
      future: [...state.future, { nodes: state.bundle.nodes, blocks: state.bundle.blocks }],
      bundle: { ...state.bundle, nodes: previous.nodes, blocks: previous.blocks },
    });
    scheduleSave(get, set);
  },

  redo: () => {
    const state = get();
    if (!state.bundle || state.future.length === 0) return;
    const next = state.future[state.future.length - 1];
    set({
      future: state.future.slice(0, -1),
      history: [...state.history, { nodes: state.bundle.nodes, blocks: state.bundle.blocks }],
      bundle: { ...state.bundle, nodes: next.nodes, blocks: next.blocks },
    });
    scheduleSave(get, set);
  },

  setProvider: async (provider) => {
    const model = defaultModelFor(provider);
    set({ provider, model });
    await setSetting("provider", provider);
    await setSetting("model", model);
  },

  setOpenAIKey: (key) => set({ openaiApiKey: key.trim() }),
  setDeepseekKey: (key) => set({ deepseekApiKey: key.trim() }),
  setOpenCodeGoKey: (key) => set({ opencodeGoApiKey: key.trim() }),
  setCcSwitchKeyEnabled: async (enabled) => {
    set({ ccSwitchKeyEnabled: enabled });
    await setSetting("ccSwitchKeyEnabled", enabled);
  },
  clearCurrentKey: () => {
    const { provider } = get();
    if (provider === "deepseek") set({ deepseekApiKey: "" });
    else if (provider === "opencode-go") set({ opencodeGoApiKey: "" });
    else set({ openaiApiKey: "" });
  },

  validateApiKeyAction: async () => {
    const state = get();
    const apiKey = currentApiKey(state);
    const { provider, model } = state;
    if (!apiKey) {
      get().showToast(`请先输入 ${providerDisplayName(provider)} API Key。`, "error");
      return false;
    }
    try {
      const result = await validateKey(provider, apiKey, model);
      get().showToast(`${providerDisplayName(provider)} API Key 有效，模型 ${result.model} 可用。`, "success");
      return true;
    } catch (error) {
      get().showToast(error instanceof Error ? error.message : "API Key 验证失败。", "error");
      return false;
    }
  },

  setModel: async (model) => {
    set({ model });
    await setSetting("model", model);
  },

  attachCourseware: async (file) => {
    const bundle = get().bundle;
    if (!bundle) return null;
    if (bundle.note.sourcesLockedAt || bundle.note.generationState === "completed") {
      get().showToast("知识树生成成功后，这份笔记的资料集合已经锁定。", "error");
      return null;
    }
    set({ isGenerating: true, generationMessage: "正在解析课件…", generationProgress: 12 });
    try {
      const existing = bundle.sources || [];
      let source = await parseCourseware(file, bundle.note.id);
      const duplicate = existing.find((item) => item.sha256 && item.sha256 === source.sha256);
      if (duplicate) {
        set({ isGenerating: false, generationProgress: 0, generationMessage: "" });
        get().showToast(`“${duplicate.fileName}”已经在这份笔记中，未重复添加。`, "info");
        return duplicate;
      }
      source = { ...source, order: existing.length };
      try {
        await upsertSourceDocument(source);
      } catch {
        source = { ...source, originalBlob: undefined, attachmentOmitted: true };
        await upsertSourceDocument(source);
        get().showToast("课件已解析，但当前浏览器无法保存原始附件，只保留了提取内容。", "info");
      }
      const sources = (await db.sources.where("noteId").equals(bundle.note.id).toArray()).sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
      await updateNote(bundle.note.id, { generationState: "sources_ready" });
      set((state) => state.bundle ? {
        bundle: { ...state.bundle, source: sources[0], sources, note: { ...state.bundle.note, generationState: "sources_ready" } },
        isGenerating: false,
        generationMessage: source.parseStatus === "parsed" ? "课件解析完成。" : "课件解析完成，但存在限制。",
        generationProgress: 100,
      } : { isGenerating: false, generationProgress: 0 });
      if (source.parseStatus === "failed") get().showToast(source.parseError || "课件解析失败。", "error");
      else if (!source.attachmentOmitted) get().showToast(source.parseError || "课件解析完成。", source.parseStatus === "parsed" ? "success" : "info");
      return source;
    } catch (error) {
      set({ isGenerating: false, generationProgress: 0, generationMessage: "" });
      get().showToast(error instanceof Error ? error.message : "课件读取失败。请重新选择文件。", "error");
      return null;
    }
  },

  deleteSourceAction: async (sourceId) => {
    const bundle = get().bundle;
    if (!bundle) return;
    if (bundle.note.sourcesLockedAt || bundle.note.generationState === "completed") {
      get().showToast("知识树生成成功后，资料集合已经锁定。", "error");
      return;
    }
    await db.sources.delete(sourceId);
    const sources = (await db.sources.where("noteId").equals(bundle.note.id).toArray()).sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
    set((state) => state.bundle ? { bundle: { ...state.bundle, source: sources[0], sources } } : {});
  },

  reorderSourcesAction: async (sourceIds) => {
    const bundle = get().bundle;
    if (!bundle) return;
    if (bundle.note.sourcesLockedAt || bundle.note.generationState === "completed") {
      get().showToast("知识树生成成功后，资料顺序已经锁定。", "error");
      return;
    }
    await db.transaction("rw", db.sources, async () => {
      for (let index = 0; index < sourceIds.length; index += 1) await db.sources.update(sourceIds[index], { order: index });
    });
    const sources = (await db.sources.where("noteId").equals(bundle.note.id).toArray()).sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
    set((state) => state.bundle ? { bundle: { ...state.bundle, source: sources[0], sources } } : {});
  },

  saveLearningProfile: async (profile) => {
    const bundle = get().bundle;
    if (bundle?.note.profileLockedAt || bundle?.profile?.lockedAt) {
      get().showToast("这份笔记的学习偏好已经锁定。", "error");
      return;
    }
    await upsertLearningProfile(profile);
    set((state) => state.bundle ? { bundle: { ...state.bundle, profile } } : {});
  },

  saveLearningMapAction: async (map) => {
    await upsertLearningMap(map);
  },

  materializeLearningOpeningAction: async () => {
    const bundle = get().bundle;
    if (!bundle?.introduction) return;
    const outline = composeLearningOpeningOutline(bundle, bundle.introduction, iso());
    const editorDoc = await writeExternalTree(bundle.note.id, outline.nodes, outline.blocks);
    set((state) => state.bundle ? {
      bundle: {
        ...state.bundle,
        note: {
          ...state.bundle.note,
          editorDoc,
          revision: (state.bundle.note.revision || 0) + 1,
          updatedAt: iso(),
        },
        nodes: outline.nodes,
        blocks: outline.blocks,
      },
      selectedNodeId: outline.nodes[0]?.id || state.selectedNodeId,
      selectedBlockId: outline.blocks[0]?.id || state.selectedBlockId,
    } : {});
  },

  generateOpeningAction: async () => {
    const bundle = get().bundle;
    if (!bundle?.source || !bundle.profile) {
      get().showToast("请先上传课件并完成学习三问。", "error");
      return;
    }
    const state = get();
    const apiKey = currentApiKey(state);
    if (!apiKey) {
      get().showToast(`请先在设置中输入并验证 ${providerDisplayName(state.provider)} API Key。`, "error");
      return;
    }
    set({ isGenerating: true, generationMessage: "正在生成学习开场…", generationProgress: 20 });
    try {
      const sourceText = sourceToText(bundle.source);
      const response = await generateOpening(state.provider, apiKey, state.model, sourceText, bundle.profile);
      const introduction = response.data as LearningIntroduction;
      introduction.noteId = bundle.note.id;
      introduction.generatedAt = iso();
      introduction.userModified = false;
      await upsertIntroduction(introduction);
      const openingOutline = composeLearningOpeningOutline(bundle, introduction, iso());
      const editorDoc = await writeExternalTree(bundle.note.id, openingOutline.nodes, openingOutline.blocks);
      await recordAIRequest({
        id: nanoid(),
        noteId: bundle.note.id,
        operation: "learning-opening",
        model: response.model,
        provider: state.provider,
        ...response.usage,
        estimatedCost: response.usage.estimatedCost,
        currency: response.usage.currency,
        status: "success",
        createdAt: iso(),
      });
      set((state) => state.bundle ? {
        bundle: {
          ...state.bundle,
          note: {
            ...state.bundle.note,
            editorDoc,
            revision: (state.bundle.note.revision || 0) + 1,
            updatedAt: iso(),
          },
          introduction,
          nodes: openingOutline.nodes,
          blocks: openingOutline.blocks,
        },
        isGenerating: false,
        generationMessage: "学习开场已生成。",
        generationProgress: 100,
      } : { isGenerating: false });
      get().showToast("学习开场已生成，请确认或修改。", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "生成学习开场失败。";
      await recordAIRequest({
        id: nanoid(),
        noteId: bundle.note.id,
        operation: "learning-opening",
        model: get().model,
        provider: state.provider,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: 0,
        status: "error",
        error: message,
        createdAt: iso(),
      });
      set({ isGenerating: false, generationMessage: "", generationProgress: 0 });
      get().showToast(message, "error");
    }
  },

  generateTreeAction: async () => {
    const bundle = get().bundle;
    if (!bundle || !(bundle.sources?.length || bundle.source) || !bundle.profile) {
      get().showToast("请先上传课件并完成三项学习偏好。", "error"); return;
    }
    if (bundle.note.generationState === "completed") {
      get().showToast("这份笔记已经生成过知识树，不能覆盖。需要新内容时请新建笔记。", "error"); return;
    }
    if (get().isGenerating && get().generationNoteId === bundle.note.id) {
      get().showToast("这份笔记的后台生成任务已经在运行。", "info"); return;
    }
    const profile = bundle.profile;
    if (!profile.intent || !profile.level || !profile.purpose || (profile.purpose === "custom" && !profile.customPurpose?.trim())) {
      get().showToast("三项学习偏好必须全部有效填写。", "error"); return;
    }
    const state = get();
    const apiKey = currentApiKey(state);
    if (!apiKey) {
      get().showToast(`请先配置 ${providerDisplayName(state.provider)} API Key。`, "error"); return;
    }
    const orderedSources = (bundle.sources?.length ? bundle.sources : [bundle.source!]).sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
    const lockedAt = iso();
    await updateNote(bundle.note.id, { generationState: "generating", generationError: null, sourcesLockedAt: lockedAt, profileLockedAt: lockedAt });
    try {
      await flushWorkspace();
    } catch (error) {
      const message = error instanceof Error ? error.message : "笔记尚未同步到云端工作区。";
      await updateNote(bundle.note.id, { generationState: "failed", generationError: message, sourcesLockedAt: null, profileLockedAt: null });
      get().showToast(`无法开始生成：${message}`, "error");
      return;
    }
    set({
      isGenerating: true, generationNoteId: bundle.note.id,
      generationMessage: "正在提交后台生成任务…", generationProgress: 1,
      generationStage: "QUEUED", generationPageRange: null, generationSectionTitle: null, generationCurrentFile: null,
      generationTotalPages: orderedSources.reduce((sum, source) => sum + source.pages.length + source.slides.length, 0),
    });
    try {
      const sourceText = orderedSources.map((source, index) => {
        const marker = `=== 资料 ${index + 1}：${source.fileName} ===`;
        // Repeat the source marker at each real page boundary so every durable
        // job update can name the exact file as well as its parsed page range.
        const pages = sourceToText(source).split("\n\n").map((part) => `${marker}\n${part}`).join("\n\n");
        return pages || `${marker}`;
      }).join("\n\n");
      const sourceSnapshot = orderedSources.map((source, index) => ({
        id: source.id, order: index, fileName: source.fileName, kind: source.kind,
        pages: source.pages.length, slides: source.slides.length, textCharCount: source.textCharCount,
      }));
      const response = await generateFullLearningPackage(state.provider, apiKey, state.model, {
        noteId: bundle.note.id, sourceText, profile,
        customization: String(profile.customization || "").trim(), sourceSnapshot,
        totalPages: orderedSources.reduce((sum, source) => sum + source.pages.length + source.slides.length, 0),
      }, ({ progress, message, job }) => {
        set((current) => ({
          generationProgress: progress, generationMessage: message, generationStage: job.stage,
          generationPageRange: job.status === "RETRY_PENDING" ? current.generationPageRange : job.pageRange,
          generationSectionTitle: job.status === "RETRY_PENDING" ? current.generationSectionTitle : job.sectionTitle,
          generationCurrentFile: job.status === "RETRY_PENDING" ? current.generationCurrentFile : job.currentFile,
          ...(job.status === "RETRY_PENDING" ? { generationProgress: current.generationProgress } : {}),
        }));
      });
      await applyGenerationResultToLocal(response, bundle.note.id, state.provider);
    } catch (error) {
      const message = error instanceof Error ? error.message : "生成知识树失败。";
      const unavailable = (error as { code?: string }).code === "generation_poll_unavailable";
      if (unavailable) {
        set((current) => current.generationNoteId === bundle.note.id ? {
          isGenerating: false, generationMessage: "", generationProgress: 0,
          generationStage: "", generationPageRange: null, generationSectionTitle: null, generationCurrentFile: null, generationTotalPages: 0,
        } : {});
        useAppStore.getState().showToast("暂时无法读取后台任务状态。任务仍可能继续，重新打开这篇笔记会自动恢复。", "error");
        return;
      }
      await recordAIRequest({ id: nanoid(), noteId: bundle.note.id, operation: "full-learning-package", model: get().model, provider: state.provider, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, status: "error", error: message, createdAt: iso() });
      await updateNote(bundle.note.id, { generationState: "failed", generationError: message, sourcesLockedAt: null, profileLockedAt: null });
      set((current) => current.generationNoteId === bundle.note.id ? {
        isGenerating: false, generationMessage: "", generationProgress: 0,
        generationStage: "", generationPageRange: null, generationSectionTitle: null, generationCurrentFile: null,
      } : {});
      useAppStore.getState().showToast(message, "error");
    }
  },

  resumeGenerationForNote: async (noteId) => {
    if (generationWatchers.has(noteId)) return generationWatchers.get(noteId);
    try {
      const job = await getActiveFullLearningPackageJob(noteId);
      if (!job) {
        if (get().generationNoteId === noteId) {
          set({
            isGenerating: false, generationNoteId: null,
            generationMessage: "", generationProgress: 0, generationStage: "",
            generationPageRange: null, generationSectionTitle: null,
            generationCurrentFile: null, generationTotalPages: 0,
          });
        }
        return;
      }
      set({
        isGenerating: true, generationNoteId: noteId, generationMessage: job.message,
        generationProgress: job.progress, generationStage: job.stage,
        generationPageRange: job.pageRange, generationSectionTitle: job.sectionTitle,
        generationCurrentFile: job.currentFile, generationTotalPages: job.totalPages,
      });
      await followPersistentGenerationJob(job, noteId);
    } catch (error) {
      console.warn("River generation recovery check failed", error);
    }
  },

  runRegenerate: async (nodeId, blockId) => {
    const bundle = get().bundle;
    const node = bundle?.nodes.find((item) => item.id === nodeId);
    const block = bundle?.blocks.find((item) => item.id === blockId);
    const state = get();
    const apiKey = currentApiKey(state);
    if (!apiKey) {
      get().showToast(`请先在设置中配置 ${providerDisplayName(state.provider)} API Key。`, "error");
      return;
    }
    if (!bundle || !node || !block) return;
    set({ isGenerating: true, generationMessage: "正在重新生成…", generationProgress: 20 });
    try {
      const response = await regenerateBlock(state.provider, apiKey, state.model, {
        nodeTitle: node.title,
        blockType: block.type,
        currentText: block.text,
        context: bundle.nodes.map((item) => item.title).join(" / "),
      });
      set({
        pendingAI: {
          kind: "regenerate",
          nodeId,
          blockId,
          text: response.data.text,
          rationale: response.data.rationale,
          baseRevision: bundle.note.updatedAt,
          baseText: block.text,
          requestedAt: iso(),
        },
        isGenerating: false,
        generationProgress: 100,
      });
    } catch (error) {
      set({ isGenerating: false, generationProgress: 0 });
      get().showToast(error instanceof Error ? error.message : "重新生成失败。", "error");
    }
  },

  runSimplify: async (nodeId, blockId) => {
    const bundle = get().bundle;
    const node = bundle?.nodes.find((item) => item.id === nodeId);
    const block = bundle?.blocks.find((item) => item.id === blockId);
    const state = get();
    const apiKey = currentApiKey(state);
    if (!apiKey) {
      get().showToast(`请先在设置中配置 ${providerDisplayName(state.provider)} API Key。`, "error");
      return;
    }
    if (!bundle || !node || !block) return;
    set({ isGenerating: true, generationMessage: "正在用更简单的话解释…", generationProgress: 20 });
    try {
      const response = await simplifyBlock(state.provider, apiKey, state.model, {
        nodeTitle: node.title,
        currentText: block.text,
        context: bundle.nodes.map((item) => item.title).join(" / "),
      });
      set({
        pendingAI: {
          kind: "simplify",
          nodeId,
          blockId,
          text: response.data.text,
          baseRevision: bundle.note.updatedAt,
          baseText: block.text,
          requestedAt: iso(),
        },
        isGenerating: false,
        generationProgress: 100,
      });
    } catch (error) {
      set({ isGenerating: false, generationProgress: 0 });
      get().showToast(error instanceof Error ? error.message : "说人话失败。", "error");
    }
  },

  runExpand: async (nodeId) => {
    const bundle = get().bundle;
    const node = bundle?.nodes.find((item) => item.id === nodeId);
    const state = get();
    const apiKey = currentApiKey(state);
    if (!apiKey) {
      get().showToast(`请先在设置中配置 ${providerDisplayName(state.provider)} API Key。`, "error");
      return;
    }
    if (!bundle || !node) return;
    const currentText = bundle.blocks.filter((block) => block.nodeId === nodeId).map((block) => block.text).join("\n");
    set({ isGenerating: true, generationMessage: "正在展开下一层…", generationProgress: 20 });
    try {
      const response = await expandNode(state.provider, apiKey, state.model, {
        nodeTitle: node.title,
        currentText,
        context: bundle.nodes.map((item) => item.title).join(" / "),
      });
      set({
        pendingAI: {
          kind: "expand",
          nodeId,
          explanation: response.data.explanation,
          children: response.data.children,
          baseRevision: bundle.note.updatedAt,
          baseText: currentText,
          requestedAt: iso(),
        },
        isGenerating: false,
        generationProgress: 100,
      });
    } catch (error) {
      set({ isGenerating: false, generationProgress: 0 });
      get().showToast(error instanceof Error ? error.message : "展开失败。", "error");
    }
  },

  applyPendingAI: async () => {
    const state = get();
    const pending = state.pendingAI;
    const bundle = state.bundle;
    if (!pending || !bundle) return;
    const currentTargetText = pending.kind === "expand"
      ? bundle.blocks.filter((block) => block.nodeId === pending.nodeId).map((block) => block.text).join("\n")
      : bundle.blocks.find((block) => block.id === pending.blockId)?.text;
    if (typeof pending.baseText === "string" && currentTargetText !== pending.baseText) {
      set({ pendingAI: { ...pending, conflict: true } });
      get().showToast("目标内容已被你修改，AI 结果没有自动覆盖。请选择保留你的修改，或仍然应用 AI。", "info");
      return;
    }
    await get().forceApplyPendingAI();
  },

  forceApplyPendingAI: async () => {
    const state = get();
    const pending = state.pendingAI;
    const bundle = state.bundle;
    if (!pending || !bundle) return;
    const createdAt = iso();
    if (pending.kind === "expand") {
      const newNodes = [...bundle.nodes];
      const newBlocks = [...bundle.blocks];
      const explanationBlock: ContentBlock = {
        id: nanoid(),
        nodeId: pending.nodeId,
        noteId: bundle.note.id,
        order: bundle.blocks.filter((block) => block.nodeId === pending.nodeId).length,
        type: "explanation",
        text: pending.explanation || "",
        sourceRefs: [],
        userModified: false,
        createdAt,
        updatedAt: createdAt,
      };
      newBlocks.push(explanationBlock);
      (pending.children || []).forEach((child, index) => {
        const childId = nanoid();
        newNodes.push({
          id: childId,
          noteId: bundle.note.id,
          parentId: pending.nodeId,
          order: bundle.nodes.filter((node) => node.parentId === pending.nodeId).length + index,
          title: child.title,
          nodeType: "knowledge",
          collapsed: false,
          sourceRefs: [],
          userModified: false,
          createdAt,
          updatedAt: createdAt,
        });
        child.blocks.forEach((block, blockIndex) => {
          newBlocks.push({
            id: nanoid(),
            nodeId: childId,
            noteId: bundle.note.id,
            order: blockIndex,
            type: block.type,
            text: block.text,
            sourceRefs: block.sourceRefs || [],
            userModified: false,
            createdAt,
            updatedAt: createdAt,
          });
        });
      });
      const editorDoc = await writeExternalTree(bundle.note.id, newNodes, newBlocks);
      set((state) => state.bundle?.note.id === bundle.note.id ? {
        bundle: {
          ...bundle,
          note: {
            ...bundle.note,
            editorDoc,
            revision: (bundle.note.revision || 0) + 1,
            updatedAt: createdAt,
          },
          nodes: newNodes,
          blocks: newBlocks,
        },
        pendingAI: null,
      } : { pendingAI: null });
    } else if (pending.blockId && pending.text) {
      const blocks = bundle.blocks.map((block) => block.id === pending.blockId ? { ...block, text: pending.text!, updatedAt: createdAt, userModified: true } : block);
      const editorDoc = await writeExternalTree(bundle.note.id, bundle.nodes, blocks);
      set((state) => state.bundle?.note.id === bundle.note.id ? {
        bundle: {
          ...bundle,
          note: {
            ...bundle.note,
            editorDoc,
            revision: (bundle.note.revision || 0) + 1,
            updatedAt: createdAt,
          },
          blocks,
        },
        pendingAI: null,
      } : { pendingAI: null });
    } else {
      set({ pendingAI: null });
    }
    get().showToast("AI 结果已应用。", "success");
  },

  discardPendingAI: () => set({ pendingAI: null }),

  exportBackup: async () => {
    const data = await createBackupPayload();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `river-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    get().showToast("知识库备份已导出。", "success");
  },

  importBackup: async (file) => {
    const text = await file.text();
    const data = JSON.parse(text);
    const confirmed = window.confirm("导入会覆盖当前浏览器中的 River 数据。确认继续吗？");
    if (!confirmed) return;
    await restoreBackupPayload(data);
    get().closeNote();
    await get().refreshLibrary();
    get().showToast("知识库已恢复。", "success");
  },

  generateLargeTestTree: async (count = 120) => {
    const bundle = get().bundle;
    if (!bundle) return;
    const createdAt = iso();
    const nodes: KnowledgeNode[] = [];
    const blocks: ContentBlock[] = [];
    const rootId = nanoid();
    nodes.push({
      id: rootId,
      noteId: bundle.note.id,
      parentId: null,
      order: 0,
      title: "120 节点性能测试",
      nodeType: "root",
      collapsed: false,
      sourceRefs: [],
      userModified: true,
      createdAt,
      updatedAt: createdAt,
    });
    let remaining = count;
    let chapterIndex = 0;
    while (remaining > 0) {
      const chapterId = nanoid();
      nodes.push({
        id: chapterId,
        noteId: bundle.note.id,
        parentId: rootId,
        order: chapterIndex,
        title: `测试章节 ${chapterIndex + 1}`,
        nodeType: "chapter",
        collapsed: false,
        sourceRefs: [],
        userModified: true,
        createdAt,
        updatedAt: createdAt,
      });
      remaining -= 1;
      const childCount = Math.min(11, remaining);
      for (let childIndex = 0; childIndex < childCount; childIndex += 1) {
        const childId = nanoid();
        nodes.push({
          id: childId,
          noteId: bundle.note.id,
          parentId: chapterId,
          order: childIndex,
          title: `知识点 ${chapterIndex + 1}.${childIndex + 1}`,
          nodeType: "knowledge",
          collapsed: false,
          sourceRefs: [],
          userModified: true,
          createdAt,
          updatedAt: createdAt,
        });
        blocks.push({
          id: nanoid(),
          nodeId: childId,
          noteId: bundle.note.id,
          order: 0,
          type: "explanation",
          text: `这是第 ${chapterIndex + 1}.${childIndex + 1} 个性能测试知识点，用来验证编辑、折叠、滚动和保存。`,
          sourceRefs: [],
          userModified: true,
          createdAt,
          updatedAt: createdAt,
        });
      }
      remaining -= childCount;
      chapterIndex += 1;
    }
    const started = performance.now();
    const editorDoc = await writeExternalTree(bundle.note.id, nodes, blocks);
    set((state) => state.bundle ? {
      bundle: {
        ...state.bundle,
        note: {
          ...state.bundle.note,
          editorDoc,
          revision: (state.bundle.note.revision || 0) + 1,
          updatedAt: createdAt,
        },
        nodes,
        blocks,
      },
      selectedNodeId: rootId,
      selectedBlockId: null,
      history: [],
      future: [],
    } : {});
    get().showToast(`已生成 ${nodes.length} 个测试节点，保存耗时 ${Math.round(performance.now() - started)}ms。`, "success");
  },

  showToast: (message, type = "info") => {
    const toast = { id: nanoid(), message, type };
    set({ toast });
    globalThis.setTimeout(() => {
      if (get().toast?.id === toast.id) set({ toast: null });
    }, 4200);
  },
}));

const generationWatchers = new Map<string, Promise<void>>();

async function followPersistentGenerationJob(job: GenerationJob, noteId: string): Promise<void> {
  const existing = generationWatchers.get(noteId);
  if (existing) return existing;
  const task = (async () => {
    try {
      const result = await waitForFullLearningPackage(job.jobId, ({ progress, message, job: current }) => {
        useAppStore.setState((state) => state.generationNoteId === noteId ? {
          generationProgress: current.status === "RETRY_PENDING" ? state.generationProgress : progress,
          generationMessage: message, generationStage: current.stage,
          generationPageRange: current.status === "RETRY_PENDING" ? state.generationPageRange : current.pageRange,
          generationSectionTitle: current.status === "RETRY_PENDING" ? state.generationSectionTitle : current.sectionTitle,
          generationCurrentFile: current.status === "RETRY_PENDING" ? state.generationCurrentFile : current.currentFile,
          generationTotalPages: current.status === "RETRY_PENDING" ? state.generationTotalPages : current.totalPages,
        } : {});
      });
      await applyGenerationResultToLocal(result, noteId, job.provider as AIProvider);
    } catch (error) {
      const message = error instanceof Error ? error.message : "后台生成任务失败。";
      const unavailable = (error as { code?: string }).code === "generation_poll_unavailable";
      if (!unavailable) await updateNote(noteId, { generationState: "failed", generationError: message, sourcesLockedAt: null, profileLockedAt: null });
      useAppStore.setState((state) => state.generationNoteId === noteId ? {
        isGenerating: false, generationMessage: "", generationProgress: 0,
        generationStage: "", generationPageRange: null, generationSectionTitle: null, generationCurrentFile: null, generationTotalPages: 0,
      } : {});
      useAppStore.getState().showToast(unavailable ? "暂时无法读取后台任务状态。任务仍可能继续，重新打开这篇笔记会自动恢复。" : message, "error");
    } finally {
      generationWatchers.delete(noteId);
      if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(`river.generation-job.${noteId}`);
    }
  })();
  generationWatchers.set(noteId, task);
  return task;
}

async function applyGenerationResultToLocal(
  response: AIResponse<FullLearningPackageData>,
  noteId: string,
  provider: AIProvider,
): Promise<void> {
  const bundle = await getNoteBundle(noteId);
  if (!bundle) throw new Error("目标笔记不存在，无法应用生成结果。");
  const commit = response.data.commit;
  let finalNodes: KnowledgeNode[];
  let finalBlocks: ContentBlock[];
  let finalNote: Note;
  let finalProfile: LearningProfile | undefined;
  let finalIntroduction: LearningIntroduction;

  if (commit) {
    await enqueueTreeSave(noteId, commit.nodes, commit.blocks, commit.note.editorDoc);
    await Promise.all([
      ...commit.learningMaps.map((map) => upsertLearningMap(map)),
      upsertIntroduction(commit.introduction),
      upsertLearningProfile(commit.profile),
    ]);
    const { id: _id, createdAt: _createdAt, folderId: _folderId, ...patch } = commit.note;
    await updateNote(noteId, patch);
    finalNodes = commit.nodes;
    finalBlocks = commit.blocks;
    finalNote = commit.note;
    finalProfile = commit.profile;
    finalIntroduction = commit.introduction;
  } else {
    const tree = response.data.tree as any;
    const createdAt = iso();
    const nodes: KnowledgeNode[] = [];
    const blocks: ContentBlock[] = [];
    const walk = (items: any[], parentId: string | null) => (items || []).forEach((item, index) => {
      const nodeId = nanoid();
      nodes.push({ id: nodeId, noteId, parentId, order: index, title: item.title, nodeType: item.nodeType, collapsed: false, sourceRefs: item.sourceRefs || [], userModified: false, createdAt, updatedAt: createdAt });
      (item.blocks || []).forEach((block: any, blockIndex: number) => blocks.push({ id: nanoid(), nodeId, noteId, order: blockIndex, type: block.type, text: block.text, sourceRefs: block.sourceRefs || [], userModified: false, createdAt, updatedAt: createdAt }));
      if (item.children?.length) walk(item.children, nodeId);
    });
    walk(tree.nodes, null);
    finalIntroduction = { ...response.data.introduction, noteId, generatedAt: createdAt, userModified: false } as LearningIntroduction;
    const composedTree = composeLearningOpeningOutline(bundle, finalIntroduction, createdAt, { nodes, blocks });
    const editorDoc = await writeExternalTree(noteId, composedTree.nodes, composedTree.blocks);
    const finishedAt = iso();
    finalProfile = { ...bundle.profile!, lockedAt: finishedAt, updatedAt: finishedAt };
    // v0.22: companion maps are a one-time copy of the two sections that now
    // live in the main tree. No extra AI calls, no reference answers, no sync.
    const companion = buildCompanionMaps(composedTree.nodes, composedTree.blocks, noteId, finishedAt);
    await Promise.all([
      ...(companion.requirements ? [upsertLearningMap(companion.requirements)] : []),
      ...(companion.questions ? [upsertLearningMap(companion.questions)] : []),
      upsertIntroduction(finalIntroduction), upsertLearningProfile(finalProfile),
    ]);
    const notePatch = { title: tree.title || bundle.note.title, editorDoc, revision: (bundle.note.revision || 0) + 1, updatedAt: finishedAt, generationState: "completed" as const, sourcesLockedAt: finishedAt, profileLockedAt: finishedAt, generatedAt: finishedAt, generationError: null };
    await updateNote(noteId, notePatch);
    finalNodes = composedTree.nodes;
    finalBlocks = composedTree.blocks;
    finalNote = { ...bundle.note, ...notePatch };
  }

  const finishedAt = finalNote.generatedAt || finalNote.updatedAt || iso();
  await recordAIRequest({
    id: nanoid(), noteId, operation: "full-learning-package", model: response.model, provider,
    ...response.usage, estimatedCost: response.usage.estimatedCost, currency: response.usage.currency,
    status: "success", createdAt: finishedAt,
  });
  if (commit) await adoptServerWorkspaceRevision();
  else scheduleWorkspaceSync();

  useAppStore.setState((state) => state.bundle?.note.id === noteId ? {
    bundle: { ...state.bundle, note: { ...state.bundle.note, ...finalNote }, profile: finalProfile, introduction: finalIntroduction, nodes: finalNodes, blocks: finalBlocks },
    isGenerating: false, generationNoteId: null,
    generationMessage: `知识树和两张学习地图已生成（${response.data.batchCount} 个资料批次）。`, generationProgress: 100,
    generationStage: "COMPLETED", generationPageRange: null, generationSectionTitle: null, generationCurrentFile: null, generationTotalPages: 0,
    selectedNodeId: finalNodes[0]?.id || null, selectedBlockId: finalBlocks[0]?.id || null,
  } : { isGenerating: false, generationNoteId: null });
  await useAppStore.getState().refreshLibrary();
  useAppStore.getState().showToast("完整知识树、要求式地图和问题式地图已生成。", "success");
}

function scheduleSave(get: () => AppState, set: (partial: Partial<AppState>) => void) {
  if (saveTimer) clearTimeout(saveTimer);
  set({ saveStatus: "saving" });
  saveTimer = setTimeout(async () => {
    const bundle = get().bundle;
    if (!bundle) return;
    try {
      const editorDoc = nodesToTiptap(bundle.nodes, bundle.blocks);
      await enqueueTreeSave(bundle.note.id, bundle.nodes, bundle.blocks, editorDoc);
      await updateNote(bundle.note.id, { title: bundle.note.title });
      const current = get();
      if (current.bundle?.note.id === bundle.note.id) {
        set({
          bundle: {
            ...current.bundle,
            note: {
              ...current.bundle.note,
              editorDoc,
              revision: (current.bundle.note.revision || 0) + 1,
              updatedAt: iso(),
            },
          },
        });
      }
      set({ saveStatus: "saved", saveError: null });
    } catch (error) {
      set({ saveStatus: "error", saveError: error instanceof Error ? error.message : "保存失败。" });
    }
  }, 500);
}
