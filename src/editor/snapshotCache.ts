import type { EditorDocumentSnapshot } from "../types";

/**
 * Synchronous write-ahead cache for the active editor document.
 *
 * IndexedDB is the durable store, but its writes are asynchronous. A reload,
 * crash, or navigation fired immediately after Cmd+Z can therefore destroy the
 * only transaction that carries the restored document. localStorage is
 * synchronous, so the snapshot is on disk before the browser leaves the page.
 * It is cleared as soon as the matching IndexedDB write succeeds.
 */
const KEY_PREFIX = "river.editor-snapshot.v1.";

interface CachedSnapshot {
  editorDoc: EditorDocumentSnapshot;
  savedAt: number;
}

function keyFor(noteId: string, instanceId = "main"): string {
  const scope = instanceId === "main" ? `main:${noteId}` : instanceId;
  return `${KEY_PREFIX}${encodeURIComponent(scope)}.${noteId}`;
}

function legacyKeyFor(noteId: string): string {
  return `${KEY_PREFIX}${noteId}`;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function cacheEditorSnapshot(noteId: string, editorDoc: EditorDocumentSnapshot, instanceId = "main"): void {
  const target = storage();
  if (!target) return;
  try {
    const payload: CachedSnapshot = { editorDoc, savedAt: Date.now() };
    target.setItem(keyFor(noteId, instanceId), JSON.stringify(payload));
    if (instanceId === "main") target.setItem(legacyKeyFor(noteId), JSON.stringify(payload));
  } catch {
    // Quota or privacy-mode failures must not interrupt editing.
  }
}

export function readEditorSnapshot(noteId: string, instanceId = "main"): EditorDocumentSnapshot | null {
  return readEditorSnapshotRecord(noteId, instanceId)?.editorDoc ?? null;
}

export function readEditorSnapshotRecord(noteId: string, instanceId = "main"): CachedSnapshot | null {
  const target = storage();
  if (!target) return null;
  try {
    const raw = target.getItem(keyFor(noteId, instanceId)) || (instanceId === "main" ? target.getItem(legacyKeyFor(noteId)) : null);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedSnapshot>;
    const doc = parsed.editorDoc;
    if (!doc || typeof doc !== "object" || !Array.isArray(doc.content)) return null;
    return {
      editorDoc: doc,
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0,
    };
  } catch {
    return null;
  }
}

function sameDocument(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Clears the cache only when it still represents the snapshot just saved. */
export function clearEditorSnapshot(noteId: string, savedDoc?: EditorDocumentSnapshot, instanceId = "main"): void {
  const target = storage();
  if (!target) return;
  try {
    if (savedDoc) {
      const cached = readEditorSnapshot(noteId, instanceId);
      if (cached && !sameDocument(cached, savedDoc)) return;
    }
    target.removeItem(keyFor(noteId, instanceId));
    if (instanceId === "main") target.removeItem(legacyKeyFor(noteId));
  } catch {
    // A leftover entry is harmless: recovery compares it with IndexedDB.
  }
}
