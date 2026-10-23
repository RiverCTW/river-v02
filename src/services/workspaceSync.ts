import { createBackupPayload, restoreBackupPayload } from "../db/backup";
import { db } from "../db/database";

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

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    if (!hydrating && activeUserId && activePayloadExists) scheduleWorkspaceSync();
  }, 1200);
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
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

async function createCloudWorkspacePayload() {
  const payload = await createBackupPayload();
  const { nodes: _nodes, blocks: _blocks, ...payloadWithoutProjections } = payload as any;
  return {
    ...payloadWithoutProjections,
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
    hydrating = true;
    try {
      const payload = remote.payload?.format ? remote.payload : { format: "river-backup", version: 2, ...remote.payload };
      await restoreBackupPayload(payload);
    } finally {
      hydrating = false;
    }
    activeUserId = userId;
    activeRevision = remote.revision;
    activePayloadExists = true;
    lastSignature = payloadSignature(await createCloudWorkspacePayload());
    startPolling();
    localStorage.setItem(revisionKey(userId), String(remote.revision));
    notify("saved");
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
    if (typed.status === 409 || typed.code === "workspace_revision_conflict") notify("conflict", typed.message);
    else notify("error", typed.message);
    throw error;
  } finally {
    syncing = false;
  }
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
