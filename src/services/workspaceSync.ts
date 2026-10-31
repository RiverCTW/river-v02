import { createBackupPayload, deserializeSourcesFromBackup, restoreBackupPayload } from "../db/backup";
import { db } from "../db/database";
import { authHeaders } from "./sessionAuth";

export type WorkspaceSyncState = "idle" | "syncing" | "saved" | "conflict" | "offline" | "error";

let activeUserId: string | null = null;
let activeRevision = 0;
let activePayloadExists = false;
let hydrating = false;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncPromise: Promise<void> = Promise.resolve();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastSignature = "";
let syncing = false;
let pulling = false;

const listeners = new Set<(state: WorkspaceSyncState, detail?: string) => void>();

function notify(state: WorkspaceSyncState, detail?: string) {
  listeners.forEach((listener) => listener(state, detail));
}

function revisionKey(userId: string) {
  return `river.workspace.revision.${userId}`;
}

function payloadSignature(payload: any) {
  return JSON.stringify({ ...payload, exportedAt: null });
}

function recordTime(item: any): number {
  const value = item?.updatedAt || item?.createdAt || item?.generatedAt || item?.lastOpenedAt;
  const parsed = value ? Date.parse(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function mergeRecords(localItems: any[] = [], remoteItems: any[] = [], keyOf: (item: any) => string) {
  const items = new Map<string, any>();
  for (const item of remoteItems) items.set(keyOf(item), item);
  for (const item of localItems) {
    const key = keyOf(item);
    const remote = items.get(key);
    if (!remote || recordTime(item) >= recordTime(remote)) items.set(key, item);
  }
  return [...items.values()];
}

export function mergeWorkspacePayloads(local: any, remote: any) {
  const base = remote || local || {};
  const byId = (item: any) => String(item?.id || "");
  const byNote = (item: any) => String(item?.noteId || item?.key || "");
  const tombstones = new Set<string>([...(remote?.deletedNoteIds || []), ...(local?.deletedNoteIds || [])].map(String));
  const alive = (item: any) => !tombstones.has(String(item?.noteId || "")) && !tombstones.has(String(item?.id || ""));
  let sources = mergeRecords(local?.sources, remote?.sources, byId).filter(alive);
  let profiles = mergeRecords(local?.profiles, remote?.profiles, byNote).filter(alive);
  // Once a note has finished generation its sources and learning profile are
  // immutable on the server. A new device may still hold an older local cache,
  // so never let local merge overwrite those locked inputs.
  const lockedNoteIds = new Set<string>((remote?.notes || [])
    .filter((note: any) => note.generationState === "completed" || note.sourcesLockedAt)
    .map((note: any) => note.id));
  if (lockedNoteIds.size) {
    const remoteSources = (remote?.sources || []).filter((source: any) => lockedNoteIds.has(source.noteId));
    const remoteProfiles = (remote?.profiles || []).filter((profile: any) => lockedNoteIds.has(profile.noteId));
    sources = [...sources.filter((source: any) => !lockedNoteIds.has(source.noteId)), ...remoteSources];
    profiles = [...profiles.filter((profile: any) => !lockedNoteIds.has(profile.noteId)), ...remoteProfiles];
  }
  return {
    ...local,
    ...base,
    folders: mergeRecords(local?.folders, remote?.folders, byId),
    notes: mergeRecords(local?.notes, remote?.notes, byId).filter(alive),
    sources,
    profiles,
    introductions: mergeRecords(local?.introductions, remote?.introductions, byNote).filter(alive),
    nodes: mergeRecords(local?.nodes, remote?.nodes, byId).filter(alive),
    blocks: mergeRecords(local?.blocks, remote?.blocks, byId).filter(alive),
    settings: mergeRecords(local?.settings, remote?.settings, (item) => String(item?.key || "")),
    learningMaps: mergeRecords(local?.learningMaps, remote?.learningMaps, (item) => `${item?.noteId || ""}:${item?.kind || ""}`).filter(alive),
    chatMessages: mergeRecords(local?.chatMessages, remote?.chatMessages, byId).filter(alive),
    deletedNoteIds: [...tombstones],
  };
}

async function mergeWorkspaceIntoLocal(payload: any) {
  await db.transaction("rw", [db.folders, db.notes, db.sources, db.profiles, db.introductions, db.nodes, db.blocks, db.settings, db.learningMaps, db.chatMessages], async () => {
    const tombstones = Array.isArray(payload.deletedNoteIds) ? payload.deletedNoteIds.map(String) : [];
    if (tombstones.length) {
      await db.notes.bulkDelete(tombstones);
      for (const table of [db.sources, db.profiles, db.introductions, db.nodes, db.blocks, db.learningMaps, db.chatMessages] as any[]) {
        const keys = await table.where("noteId").anyOf(tombstones).primaryKeys();
        if (keys.length) await table.bulkDelete(keys);
      }
    }
    await db.folders.bulkPut(payload.folders || []);
    await db.notes.bulkPut(payload.notes || []);
    await db.sources.bulkPut(deserializeSourcesFromBackup(payload.sources || []));
    await db.profiles.bulkPut(payload.profiles || []);
    await db.introductions.bulkPut(payload.introductions || []);
    await db.nodes.bulkPut(payload.nodes || []);
    await db.blocks.bulkPut(payload.blocks || []);
    await db.settings.bulkPut(payload.settings || []);
    if (tombstones.length) {
      await db.settings.put({ key: "river.deletedNoteIds", value: tombstones, updatedAt: new Date().toISOString() });
    }
    await db.learningMaps.bulkPut(payload.learningMaps || []);
    await db.chatMessages.bulkPut(payload.chatMessages || []);
  });
}

function workspaceHasContent(payload: any): boolean {
  return Boolean(payload && ["folders", "notes", "sources", "profiles", "introductions", "settings", "learningMaps", "chatMessages"]
    .some((key) => Array.isArray(payload[key]) && payload[key].length > 0));
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    if (!hydrating && activeUserId && activePayloadExists) void pullWorkspaceChanges();
  }, 3000);
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...init,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...(init?.headers || {}) },
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(json?.error?.message || `请求失败：HTTP ${response.status}`) as Error & { status?: number; code?: string };
    error.status = response.status;
    error.code = json?.error?.code;
    throw error;
  }
  return json as T;
}

export async function pullWorkspaceChanges(): Promise<void> {
  if (!activeUserId || !activePayloadExists || hydrating || syncing || pulling) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  pulling = true;
  try {
    const remote = await request<{ payload: any | null; revision: number }>("/api/workspace");
    if (remote.revision <= activeRevision) return;
    const remotePayload = remote.payload
      ? (remote.payload.format ? remote.payload : { format: "river-backup", version: 2, ...remote.payload })
      : await createCloudWorkspacePayload();
    const localPayload = await createCloudWorkspacePayload();
    const merged = mergeWorkspacePayloads(localPayload, remotePayload);
    await mergeWorkspaceIntoLocal(merged);
    activeRevision = remote.revision;
    lastSignature = payloadSignature(merged);
    localStorage.setItem(revisionKey(activeUserId), String(activeRevision));
    notify("saved");
  } finally {
    pulling = false;
  }
}

async function createCloudWorkspacePayload() {
  const payload = await createBackupPayload();
  const tombstoneSetting = (payload.settings || []).find((item: any) => item.key === "river.deletedNoteIds");
  const deletedNoteIds = Array.isArray(tombstoneSetting?.value) ? tombstoneSetting.value.map(String) : [];
  const { nodes: _nodes, blocks: _blocks, ...payloadWithoutProjections } = payload as any;
  return {
    ...payloadWithoutProjections,
    deletedNoteIds,
    sources: (payload.sources || []).map((source) => {
      const { originalBase64: _base64, originalBlob: _blob, ...rest } = source as any;
      return { ...rest, attachmentOmitted: true };
    }),
    learningMaps: (payload.learningMaps || []).map((map) => {
      const { nodes: _mapNodes, blocks: _mapBlocks, ...rest } = map as any;
      return rest;
    }),
  };
}

export function onWorkspaceSyncState(listener: (state: WorkspaceSyncState, detail?: string) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function loadWorkspaceForUser(userId: string): Promise<{ payload: any | null; revision: number }> {
  activeUserId = null;
  activePayloadExists = false;
  const remote = await request<{ payload: any | null; revision: number }>("/api/workspace");
  if (remote.payload) {
    const remotePayload = remote.payload?.format ? remote.payload : { format: "river-backup", version: 2, ...remote.payload };
    const localPayload = await createCloudWorkspacePayload();
    let mergedPayload = workspaceHasContent(localPayload) ? mergeWorkspacePayloads(localPayload, remotePayload) : remotePayload;
    let mergedRevision = remote.revision;
    if (payloadSignature(mergedPayload) !== payloadSignature(remotePayload)) {
      try {
        const saved = await request<{ revision: number }>("/api/workspace", {
          method: "PUT",
          body: JSON.stringify({ expectedRevision: remote.revision, payload: mergedPayload }),
        });
        mergedRevision = saved.revision;
      } catch (error) {
        const typed = error as Error & { status?: number; code?: string };
        if (typed.status === 423 || typed.code === "learning_inputs_locked") {
          // A stale local cache tried to change locked inputs. Fall back to the
          // authoritative cloud payload instead of failing workspace startup.
          mergedPayload = remotePayload;
          mergedRevision = remote.revision;
        } else if (typed.status === 409 || typed.code === "workspace_revision_conflict") {
          const latest = await request<{ payload: any | null; revision: number }>("/api/workspace");
          const latestPayload = latest.payload || remotePayload;
          mergedPayload = mergeWorkspacePayloads(localPayload, latestPayload);
          try {
            const saved = await request<{ revision: number }>("/api/workspace", {
              method: "PUT",
              body: JSON.stringify({ expectedRevision: latest.revision, payload: mergedPayload }),
            });
            mergedRevision = saved.revision;
          } catch (retryError) {
            const retryTyped = retryError as Error & { status?: number; code?: string };
            if (retryTyped.status === 423 || retryTyped.code === "learning_inputs_locked") {
              mergedPayload = latestPayload;
              mergedRevision = latest.revision;
            } else {
              throw retryError;
            }
          }
        } else {
          throw error;
        }
      }
    }
    hydrating = true;
    try {
      await restoreBackupPayload(mergedPayload);
    } finally {
      hydrating = false;
    }
    activeUserId = userId;
    activeRevision = mergedRevision;
    activePayloadExists = true;
    lastSignature = payloadSignature(mergedPayload);
    startPolling();
    localStorage.setItem(revisionKey(userId), String(mergedRevision));
    notify("saved", workspaceHasContent(localPayload) ? "本地与云端工作区已安全合并。" : undefined);
  }
  return remote;
}

export async function adoptLocalWorkspace(userId: string): Promise<void> {
  const payload = await createCloudWorkspacePayload();
  const result = await request<{ revision: number }>("/api/workspace", {
    method: "PUT",
    body: JSON.stringify({ expectedRevision: 0, payload }),
  });
  activeUserId = userId;
  activeRevision = result.revision;
  activePayloadExists = true;
  lastSignature = payloadSignature(payload);
  startPolling();
  localStorage.setItem(revisionKey(userId), String(activeRevision));
  notify("saved");
}

export async function startEmptyWorkspace(userId: string): Promise<void> {
  const payload = await createCloudWorkspacePayload();
  const result = await request<{ revision: number }>("/api/workspace", {
    method: "PUT",
    body: JSON.stringify({ expectedRevision: 0, payload }),
  });
  activeUserId = userId;
  activeRevision = result.revision;
  activePayloadExists = true;
  lastSignature = payloadSignature(payload);
  startPolling();
  localStorage.setItem(revisionKey(userId), String(activeRevision));
  notify("saved");
}

export function scheduleWorkspaceSync() {
  if (!activeUserId || !activePayloadExists) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    syncPromise = syncPromise.then(() => syncWorkspaceNow()).catch(() => undefined);
  }, 320);
}

export async function syncWorkspaceNow(): Promise<void> {
  if (!activeUserId || !activePayloadExists) return;
  if (syncing) return;
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
  if (!navigator.onLine) {
    notify("offline", "离线修改已保存在本机，网络恢复后继续同步。");
    throw new Error("当前处于离线状态。");
  }
  notify("syncing");
  syncing = true;
  try {
    const payload = await createCloudWorkspacePayload();
    const signature = payloadSignature(payload);
    if (signature === lastSignature) { notify("saved"); return; }
    const result = await request<{ revision: number }>("/api/workspace", {
      method: "PUT",
      body: JSON.stringify({ expectedRevision: activeRevision, payload }),
    });
    activeRevision = result.revision;
    lastSignature = signature;
    localStorage.setItem(revisionKey(activeUserId), String(activeRevision));
    notify("saved");
  } catch (error) {
    const typed = error as Error & { status?: number; code?: string };
    if (typed.status === 409 || typed.code === "workspace_revision_conflict") {
      try {
        const remote = await request<{ payload: any | null; revision: number }>("/api/workspace");
        const localPayload = await createCloudWorkspacePayload();
        const merged = mergeWorkspacePayloads(localPayload, remote.payload || localPayload);
        const mergedResult = await request<{ revision: number }>("/api/workspace", {
          method: "PUT",
          body: JSON.stringify({ expectedRevision: remote.revision, payload: merged }),
        });
        await mergeWorkspaceIntoLocal(merged);
        activeRevision = mergedResult.revision;
        lastSignature = payloadSignature(merged);
        localStorage.setItem(revisionKey(activeUserId), String(activeRevision));
        notify("saved", "云端冲突已自动合并，双方新增内容均已保留。");
        return;
      } catch (mergeError) {
        const mergeTyped = mergeError as Error & { status?: number; code?: string };
        if (mergeTyped.status === 409 || mergeTyped.code === "workspace_revision_conflict") {
          notify("conflict", mergeTyped.message);
        } else {
          notify("error", mergeTyped.message);
        }
        throw mergeError;
      }
    }
    notify("error", typed.message);
    throw error;
  } finally {
    syncing = false;
  }
}

/**
 * Generation commits happen in a server Worker, not in this tab. After the
 * tab has applied the returned commit locally, advance its revision baseline
 * without reloading and overwriting unrelated local edits.
 */
export async function adoptServerWorkspaceRevision(): Promise<void> {
  if (!activeUserId || !activePayloadExists) return;
  const remote = await request<{ payload: any | null; revision: number }>("/api/workspace");
  activeRevision = remote.revision;
  if (remote.payload) lastSignature = payloadSignature(remote.payload);
  localStorage.setItem(revisionKey(activeUserId), String(activeRevision));
}

export async function reloadWorkspaceFromServer(userId: string): Promise<void> {
  await loadWorkspaceForUser(userId);
}

export async function flushWorkspace(): Promise<void> {
  await syncPromise.catch(() => undefined);
  if (activeUserId && activePayloadExists) await syncWorkspaceNow();
}

export async function clearLocalWorkspace(): Promise<void> {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  hydrating = true;
  try {
    await db.transaction("rw", [db.folders, db.notes, db.sources, db.profiles, db.introductions, db.nodes, db.blocks, db.aiRequests, db.settings, db.learningMaps, db.chatMessages], async () => {
      await Promise.all([
        db.folders.clear(), db.notes.clear(), db.sources.clear(), db.profiles.clear(), db.introductions.clear(),
        db.nodes.clear(), db.blocks.clear(), db.aiRequests.clear(), db.settings.clear(), db.learningMaps.clear(), db.chatMessages.clear(),
      ]);
    });
    Object.keys(localStorage).filter((key) => key.startsWith("river.editor-snapshot.v1.")).forEach((key) => localStorage.removeItem(key));
  } finally {
    hydrating = false;
    activeUserId = null;
    activeRevision = 0;
    activePayloadExists = false;
    lastSignature = "";
  }
}

export function currentWorkspaceUserId() {
  return activeUserId;
}
