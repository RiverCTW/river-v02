import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "../src/db/database";
import { loadWorkspaceForUser, mergeWorkspacePayloads } from "../src/services/workspaceSync";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("River v0.21 workspace conflict merge", () => {
  it("keeps local-only notes and remote-only notes while preferring the newer version of the same note", () => {
    const local = {
      format: "river-backup",
      version: 2,
      notes: [
        { id: "shared", title: "local older", updatedAt: "2026-10-26T04:00:00.000Z" },
        { id: "local-only", title: "CH02 local only", updatedAt: "2026-10-27T01:00:00.000Z" },
      ],
      learningMaps: [{ noteId: "local-only", kind: "questions", updatedAt: "2026-10-27T01:00:00.000Z" }],
    };
    const remote = {
      format: "river-backup",
      version: 2,
      notes: [
        { id: "shared", title: "remote newer", updatedAt: "2026-10-27T02:00:00.000Z" },
        { id: "remote-only", title: "another device note", updatedAt: "2026-10-27T03:00:00.000Z" },
      ],
      learningMaps: [{ noteId: "shared", kind: "requirements", updatedAt: "2026-10-27T02:00:00.000Z" }],
    };

    const merged = mergeWorkspacePayloads(local, remote);
    expect(merged.notes.map((note: any) => note.id).sort()).toEqual(["local-only", "remote-only", "shared"]);
    expect(merged.notes.find((note: any) => note.id === "shared").title).toBe("remote newer");
    expect(merged.learningMaps).toHaveLength(2);
  });

  it("merges existing local data before loading the cloud workspace on startup", async () => {
    vi.stubGlobal("setInterval", vi.fn(() => 0));
    await db.open();
    await db.notes.clear();
    await db.notes.put({
      id: "local-ch02", folderId: null, title: "CH02 local only", uiStyle: "effie",
      editorDoc: { type: "doc", content: [] }, createdAt: "2026-10-27T01:00:00.000Z", updatedAt: "2026-10-27T01:00:00.000Z",
    });
    const remote = {
      format: "river-backup", version: 2, folders: [], notes: [{ id: "cloud-existing", title: "cloud note", uiStyle: "effie", editorDoc: { type: "doc", content: [] }, createdAt: "2026-10-26T01:00:00.000Z", updatedAt: "2026-10-26T01:00:00.000Z" }],
      sources: [], profiles: [], introductions: [], nodes: [], blocks: [], settings: [], learningMaps: [], chatMessages: [],
    };
    let uploaded: any = null;
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined, removeItem: () => undefined, clear: () => undefined, key: () => null, length: 0 });
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        uploaded = JSON.parse(String(init.body));
        return new Response(JSON.stringify({ revision: 2 }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ payload: remote, revision: 1 }), { status: 200, headers: { "content-type": "application/json" } });
    }));

    await loadWorkspaceForUser("merge-test-user");
    expect(uploaded.payload.notes.map((note: any) => note.id).sort()).toEqual(["cloud-existing", "local-ch02"]);
    expect((await db.notes.toArray()).map((note) => note.id).sort()).toEqual(["cloud-existing", "local-ch02"]);
  });
});

describe("locked cloud inputs during new-device hydration", () => {
  const remoteLocked = {
    format: "river-backup", version: 2,
    folders: [], notes: [{ id: "locked", title: "locked note", uiStyle: "effie", generationState: "completed", sourcesLockedAt: "2026-10-27T02:00:00.000Z", createdAt: "2026-10-27T01:00:00.000Z", updatedAt: "2026-10-27T02:00:00.000Z" }],
    sources: [{ id: "remote-src", noteId: "locked", fileName: "cloud.pdf", order: 0, parseStatus: "parsed", textCharCount: 10, updatedAt: "2026-10-27T02:00:00.000Z" }],
    profiles: [{ noteId: "locked", intent: "mastery", level: "zero", purpose: "exam", createdAt: "2026-10-27T01:00:00.000Z", updatedAt: "2026-10-27T02:00:00.000Z" }],
    introductions: [], nodes: [], blocks: [], settings: [], learningMaps: [], chatMessages: [],
  };

  it("keeps remote sources and profile for a locked note even when local cache is newer", () => {
    const local = {
      format: "river-backup", version: 2,
      notes: [{ id: "locked", updatedAt: "2026-10-27T03:00:00.000Z" }],
      sources: [{ id: "local-src", noteId: "locked", fileName: "stale.pdf", order: 0, updatedAt: "2026-10-27T03:00:00.000Z" }],
      profiles: [{ noteId: "locked", intent: "overview", level: "professional", purpose: "curiosity", updatedAt: "2026-10-27T03:00:00.000Z" }],
      introductions: [], nodes: [], blocks: [], settings: [], learningMaps: [], chatMessages: [],
    };
    const merged = mergeWorkspacePayloads(local, remoteLocked);
    expect(merged.sources).toEqual(remoteLocked.sources);
    expect(merged.profiles).toEqual(remoteLocked.profiles);
  });

  it("falls back to the cloud payload when the server rejects locked input changes with 423", async () => {
    vi.stubGlobal("setInterval", vi.fn(() => 0));
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined, removeItem: () => undefined, clear: () => undefined, key: () => null, length: 0 });
    await db.open();
    await db.notes.clear();
    await db.sources.clear();
    await db.profiles.clear();
    await db.notes.put({ id: "locked", folderId: null, title: "locked note", uiStyle: "effie", generationState: "completed", sourcesLockedAt: "2026-10-27T02:00:00.000Z", createdAt: "2026-10-27T01:00:00.000Z", updatedAt: "2026-10-27T03:00:00.000Z" } as any);
    await db.sources.put({ id: "local-src", noteId: "locked", fileName: "stale.pdf", mimeType: "application/pdf", fileSize: 1, kind: "pdf", pages: [], slides: [], parseStatus: "parsed", textCharCount: 1, createdAt: "2026-10-27T03:00:00.000Z" } as any);
    await db.profiles.put({ noteId: "locked", intent: "overview", level: "professional", purpose: "curiosity", createdAt: "2026-10-27T03:00:00.000Z", updatedAt: "2026-10-27T03:00:00.000Z" } as any);
    let putCount = 0;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        putCount += 1;
        return new Response(JSON.stringify({ error: { message: "locked", code: "learning_inputs_locked" } }), { status: 423, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ payload: remoteLocked, revision: 1 }), { status: 200, headers: { "content-type": "application/json" } });
    }));
    const result = await loadWorkspaceForUser("locked-fallback-user");
    expect(putCount).toBeGreaterThan(0);
    expect(result.payload).toEqual(remoteLocked);
    expect(result.revision).toBe(1);
  });
});
