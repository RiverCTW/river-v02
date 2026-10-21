import Dexie, { type Table } from "dexie";
import { nanoid } from "nanoid";
import type {
  AIRequestRecord,
  AppSetting,
  ContentBlock,
  Folder,
  KnowledgeNode,
  LearningIntroduction,
  LearningProfile,
  Note,
  NoteBundle,
  SourceDocument,
  UIStyle,
} from "../types";
import { nodesToTiptap } from "../editor/convert";

class RiverDatabase extends Dexie {
  folders!: Table<Folder, string>;
  notes!: Table<Note, string>;
  sources!: Table<SourceDocument, string>;
  profiles!: Table<LearningProfile, string>;
  introductions!: Table<LearningIntroduction, string>;
  nodes!: Table<KnowledgeNode, string>;
  blocks!: Table<ContentBlock, string>;
  aiRequests!: Table<AIRequestRecord, string>;
  settings!: Table<AppSetting, string>;

  constructor() {
    super("river-v0.1");
    this.version(1).stores({
      folders: "id, parentId, order, updatedAt",
      notes: "id, folderId, uiStyle, updatedAt, deletedAt",
      sources: "id, noteId, parseStatus, createdAt",
      profiles: "noteId, updatedAt",
      introductions: "noteId, generatedAt",
      nodes: "id, noteId, parentId, order, updatedAt",
      blocks: "id, noteId, nodeId, order, updatedAt",
      aiRequests: "id, noteId, operation, status, createdAt",
      settings: "key, updatedAt",
    });
  }
}

export const db = new RiverDatabase();

export const nowIso = () => new Date().toISOString();

/**
 * Dexie's deep `UpdateSpec` mapped type cannot describe the recursive editor
 * snapshot, so note writes are expressed as a read/put of the whole row. The
 * row is small and this keeps one write path for every note mutation.
 */
async function patchNote(noteId: string, changes: Partial<Omit<Note, "id">>): Promise<void> {
  const existing = await db.notes.get(noteId);
  if (!existing) return;
  await db.notes.put({ ...existing, ...changes, id: noteId, updatedAt: nowIso() });
}

let seedPromise: Promise<void> | null = null;

export function ensureSeedData(): Promise<void> {
  if (!seedPromise) seedPromise = seedInitialData().then(cleanupLegacyDuplicateSeedData);
  return seedPromise;
}

async function addSeedTree(noteId: string, title: string, definition: string, explanation: string, example: string): Promise<void> {
  const existing = await db.nodes.where("noteId").equals(noteId).count();
  if (existing > 0) return;
  const createdAt = nowIso();
  const rootId = nanoid();
  const topicId = nanoid();
  const detailId = nanoid();
  await db.nodes.bulkAdd([
    { id: rootId, noteId, parentId: null, order: 0, title, nodeType: "root", collapsed: false, sourceRefs: [], userModified: false, createdAt, updatedAt: createdAt },
    { id: topicId, noteId, parentId: rootId, order: 0, title: "核心概念", nodeType: "chapter", collapsed: false, sourceRefs: [], userModified: false, createdAt, updatedAt: createdAt },
    { id: detailId, noteId, parentId: topicId, order: 0, title, nodeType: "knowledge", collapsed: false, sourceRefs: [], userModified: false, createdAt, updatedAt: createdAt },
  ]);
  await db.blocks.bulkAdd([
    { id: nanoid(), nodeId: detailId, noteId, order: 0, type: "definition", text: definition, sourceRefs: [], userModified: false, createdAt, updatedAt: createdAt },
    { id: nanoid(), nodeId: detailId, noteId, order: 1, type: "explanation", text: explanation, sourceRefs: [], userModified: false, createdAt, updatedAt: createdAt },
    { id: nanoid(), nodeId: detailId, noteId, order: 2, type: "example", text: example, sourceRefs: [], userModified: false, createdAt, updatedAt: createdAt },
  ]);
}

async function cleanupLegacyDuplicateSeedData(): Promise<void> {
  const seedFolderNames = new Set(["金融经济学", "组织行为学"]);
  const seedNoteTitles = new Set(["公司金融 第一讲", "组织行为学 第一讲"]);
  const folders = await db.folders.toArray();
  const seenFolders = new Set<string>();
  const duplicateFolderIds: string[] = [];
  folders
    .filter((folder) => folder.parentId === null && seedFolderNames.has(folder.name))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .forEach((folder) => {
      if (seenFolders.has(folder.name)) duplicateFolderIds.push(folder.id);
      else seenFolders.add(folder.name);
    });
  if (duplicateFolderIds.length) await db.folders.bulkDelete(duplicateFolderIds);

  const notes = await db.notes.toArray();
  const seenNotes = new Set<string>();
  const duplicateNoteIds: string[] = [];
  notes
    .filter((note) => seedNoteTitles.has(note.title))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .forEach((note) => {
      const key = note.title;
      if (seenNotes.has(key)) duplicateNoteIds.push(note.id);
      else seenNotes.add(key);
    });
  if (duplicateNoteIds.length) {
    await db.transaction("rw", db.notes, db.nodes, db.blocks, async () => {
      for (const noteId of duplicateNoteIds) {
        await db.nodes.where("noteId").equals(noteId).delete();
        await db.blocks.where("noteId").equals(noteId).delete();
        await db.notes.delete(noteId);
      }
    });
  }
  const keptSeedNotes = (await db.notes.toArray()).filter((note) => seedNoteTitles.has(note.title));
  const keptFolders = await db.folders.toArray();
  for (const note of keptSeedNotes) {
    const desiredFolderName = note.title === "公司金融 第一讲" ? "金融经济学" : "组织行为学";
    const desiredFolder = keptFolders.find((folder) => folder.parentId === null && folder.name === desiredFolderName);
    if (desiredFolder && note.folderId !== desiredFolder.id) {
      await patchNote(note.id, { folderId: desiredFolder.id });
    }
    if (note.title === "公司金融 第一讲") {
      await addSeedTree(note.id, note.title, "**公司金融**研究企业如何做出投资、融资和营运资金决策。", "目标是 ++最大化股东财富++，而不是单纯追求利润最大化。", "例如：企业决定投资一条新产线，需要比较未来现金流与机会成本。");
    } else {
      await addSeedTree(note.id, note.title, "**组织行为学**研究个体、群体和组织结构如何影响组织效能。", "它关注行为背后的机制，而不是只描述组织现象。", "例如：研发团队士气低下时，可以从 *领导方式*、组织文化和激励制度分析。");
    }
  }
}

async function seedInitialData(): Promise<void> {
  const existing = await db.settings.get("seed-v1");
  if (existing) return;
  await db.transaction("rw", db.folders, db.notes, db.nodes, db.blocks, db.settings, async () => {
    const alreadySeeded = await db.settings.get("seed-v1");
    if (alreadySeeded) return;
    const folderCount = await db.folders.count();
    if (folderCount > 0) {
      await db.settings.put({ key: "seed-v1", value: true, updatedAt: nowIso() });
      return;
    }
    const createdAt = nowIso();
    const financeId = nanoid();
    const obId = nanoid();
    const financeNoteId = nanoid();
    const obNoteId = nanoid();
    await db.folders.bulkAdd([
      { id: financeId, parentId: null, name: "金融经济学", order: 0, createdAt, updatedAt: createdAt },
      { id: obId, parentId: null, name: "组织行为学", order: 1, createdAt, updatedAt: createdAt },
    ]);
    await db.notes.bulkAdd([
      { id: financeNoteId, folderId: financeId, title: "公司金融 第一讲", uiStyle: "effie", createdAt, updatedAt: createdAt, deletedAt: null },
      { id: obNoteId, folderId: obId, title: "组织行为学 第一讲", uiStyle: "notability", createdAt, updatedAt: createdAt, deletedAt: null },
    ]);
    await addSeedTree(
      financeNoteId,
      "公司金融 第一讲",
      "**公司金融**研究企业如何做出投资、融资和营运资金决策。",
      "目标是 ++最大化股东财富++，而不是单纯追求利润最大化。",
      "例如：企业决定投资一条新产线，需要比较未来现金流与机会成本。",
    );
    await addSeedTree(
      obNoteId,
      "组织行为学 第一讲",
      "**组织行为学**研究个体、群体和组织结构如何影响组织效能。",
      "它关注行为背后的机制，而不是只描述组织现象。",
      "例如：研发团队士气低下时，可以从 *领导方式*、组织文化和激励制度分析。",
    );
    await db.settings.put({ key: "seed-v1", value: true, updatedAt: nowIso() });
  });
}

export async function createFolder(name: string, parentId: string | null = null): Promise<Folder> {
  const createdAt = nowIso();
  const siblings = await db.folders.where("parentId").equals(parentId ?? "null").toArray();
  const actualSiblings = parentId === null
    ? (await db.folders.toArray()).filter((folder) => folder.parentId === null)
    : siblings;
  const folder: Folder = {
    id: nanoid(),
    parentId,
    name: name.trim() || "新建文件夹",
    order: actualSiblings.length,
    createdAt,
    updatedAt: createdAt,
  };
  await db.folders.add(folder);
  return folder;
}

export async function renameFolder(folderId: string, name: string): Promise<void> {
  await db.folders.update(folderId, { name: name.trim() || "未命名文件夹", updatedAt: nowIso() });
}

export async function deleteFolder(folderId: string): Promise<{ notesMoved: number; foldersDeleted: number }> {
  return db.transaction("rw", db.folders, db.notes, async () => {
    const allFolders = await db.folders.toArray();
    const ids = new Set<string>();
    const collect = (id: string) => {
      ids.add(id);
      allFolders.filter((folder) => folder.parentId === id).forEach((folder) => collect(folder.id));
    };
    collect(folderId);
    const notes = await db.notes.where("folderId").anyOf([...ids]).toArray();
    for (const note of notes) await patchNote(note.id, { folderId: null });
    await db.folders.bulkDelete([...ids]);
    return { notesMoved: notes.length, foldersDeleted: ids.size };
  });
}

export async function createNote(folderId: string | null, title = "新建学习笔记", uiStyle: UIStyle = "effie"): Promise<Note> {
  const createdAt = nowIso();
  const rootId = nanoid();
  const rootNode: KnowledgeNode = {
    id: rootId,
    noteId: "",
    parentId: null,
    order: 0,
    title,
    nodeType: "root",
    collapsed: false,
    sourceRefs: [],
    userModified: false,
    createdAt,
    updatedAt: createdAt,
  };
  const rootBlock: ContentBlock = {
    id: nanoid(),
    nodeId: rootId,
    noteId: "",
    order: 0,
    type: "explanation",
    text: "开始记录你的学习内容。",
    sourceRefs: [],
    userModified: false,
    createdAt,
    updatedAt: createdAt,
  };
  const noteId = nanoid();
  rootNode.noteId = noteId;
  rootBlock.noteId = noteId;
  const note: Note = {
    id: noteId,
    folderId,
    title,
    uiStyle,
    editorDoc: nodesToTiptap([rootNode], [rootBlock]),
    revision: 0,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  };
  await db.transaction("rw", db.notes, db.nodes, db.blocks, async () => {
    await db.notes.add(note);
    await db.nodes.add(rootNode);
    await db.blocks.add(rootBlock);
  });
  return note;
}

export async function updateNote(noteId: string, changes: Partial<Note>): Promise<void> {
  await patchNote(noteId, changes);
}

export async function softDeleteNote(noteId: string): Promise<void> {
  await patchNote(noteId, { deletedAt: nowIso() });
}

export async function restoreNote(noteId: string): Promise<void> {
  await patchNote(noteId, { deletedAt: null });
}

export async function moveNoteToFolder(noteId: string, folderId: string | null): Promise<void> {
  await patchNote(noteId, { folderId });
}

export async function getNoteBundle(noteId: string): Promise<NoteBundle | null> {
  const note = await db.notes.get(noteId);
  if (!note) return null;
  const [sources, profile, introduction, nodes, blocks] = await Promise.all([
    db.sources.where("noteId").equals(noteId).toArray(),
    db.profiles.get(noteId),
    db.introductions.get(noteId),
    db.nodes.where("noteId").equals(noteId).toArray(),
    db.blocks.where("noteId").equals(noteId).toArray(),
  ]);
  return {
    note,
    source: sources.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0],
    profile,
    introduction,
    nodes: nodes.sort((a, b) => a.order - b.order),
    blocks: blocks.sort((a, b) => a.order - b.order),
  };
}

export async function replaceKnowledgeTree(
  noteId: string,
  nodes: KnowledgeNode[],
  blocks: ContentBlock[],
  editorDoc = nodesToTiptap(nodes, blocks),
): Promise<void> {
  await db.transaction("rw", db.notes, db.nodes, db.blocks, async () => {
    const existingNodes = await db.nodes.where("noteId").equals(noteId).toArray();
    const existingBlocks = await db.blocks.where("noteId").equals(noteId).toArray();
    const nodeIds = new Set(nodes.map((node) => node.id));
    const blockIds = new Set(blocks.map((block) => block.id));
    await db.nodes.bulkDelete(existingNodes.filter((node) => !nodeIds.has(node.id)).map((node) => node.id));
    await db.blocks.bulkDelete(existingBlocks.filter((block) => !blockIds.has(block.id)).map((block) => block.id));
    await db.nodes.bulkPut(nodes);
    await db.blocks.bulkPut(blocks);
    await patchNote(noteId, { editorDoc });
  });
}

export async function upsertSourceDocument(source: SourceDocument): Promise<void> {
  await db.sources.put(source);
}

export async function upsertLearningProfile(profile: LearningProfile): Promise<void> {
  await db.profiles.put(profile);
}

export async function upsertIntroduction(introduction: LearningIntroduction): Promise<void> {
  await db.introductions.put(introduction);
}

export async function recordAIRequest(record: AIRequestRecord): Promise<void> {
  await db.aiRequests.add(record);
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await db.settings.put({ key, value, updatedAt: nowIso() });
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const record = await db.settings.get(key);
  return record ? (record.value as T) : fallback;
}

export async function searchNotes(query: string): Promise<Note[]> {
  const normalized = query.trim().toLowerCase();
  const notes = await db.notes.filter((note) => !note.deletedAt).toArray();
  if (!normalized) return notes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const nodeMatches = await db.nodes.toArray();
  const blockMatches = await db.blocks.toArray();
  const matchedNoteIds = new Set(
    [...nodeMatches, ...blockMatches]
      .filter((item) => ("title" in item ? item.title : item.text).toLowerCase().includes(normalized))
      .map((item) => item.noteId),
  );
  return notes
    .filter((note) => note.title.toLowerCase().includes(normalized) || matchedNoteIds.has(note.id))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listActiveNotes(): Promise<Note[]> {
  return (await db.notes.toArray())
    .filter((note) => !note.deletedAt)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listDeletedNotes(): Promise<Note[]> {
  return (await db.notes.toArray())
    .filter((note) => Boolean(note.deletedAt))
    .sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));
}
