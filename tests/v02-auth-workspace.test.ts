import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../server/index";

const servers: Server[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  delete process.env.RIVER_DB_PATH;
  delete process.env.RIVER_ADMIN_USERNAME;
  delete process.env.RIVER_ADMIN_PASSWORD;
  tempDirs.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }));
});

async function startApi() {
  const directory = mkdtempSync(path.join(tmpdir(), "river-v02-auth-"));
  tempDirs.push(directory);
  process.env.RIVER_DB_PATH = path.join(directory, "river.sqlite");
  process.env.RIVER_ADMIN_USERNAME = "admin-test";
  process.env.RIVER_ADMIN_PASSWORD = "admin-secret";
  const server = createApp().listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  return `http://127.0.0.1:${address.port}`;
}

function cookieFrom(response: Response) {
  return String(response.headers.get("set-cookie") || "").split(";")[0];
}

describe("River v0.2 authentication and workspace isolation", () => {
  it("requires login, isolates users and enforces workspace revisions", async () => {
    const base = await startApi();
    const unauthorized = await fetch(`${base}/api/workspace`);
    expect(unauthorized.status).toBe(401);

    const login = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "admin-test", password: "admin-secret" }),
    });
    expect(login.status).toBe(200);
    const adminCookie = cookieFrom(login);

    const createUser = await fetch(`${base}/api/admin/users`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ username: "friend", password: "friend-secret" }),
    });
    expect(createUser.status).toBe(201);

    const adminPut = await fetch(`${base}/api/workspace`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ expectedRevision: 0, payload: { format: "river-backup", version: 2, notes: [{ id: "admin-note" }] } }),
    });
    expect(adminPut.status).toBe(200);

    const conflict = await fetch(`${base}/api/workspace`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ expectedRevision: 0, payload: { format: "river-backup", version: 2, notes: [{ id: "stale" }] } }),
    });
    expect(conflict.status).toBe(409);

    const userLogin = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "friend", password: "friend-secret" }),
    });
    const userCookie = cookieFrom(userLogin);
    const userWorkspace = await fetch(`${base}/api/workspace`, { headers: { cookie: userCookie } });
    const userPayload = await userWorkspace.json();
    expect(userPayload).toMatchObject({ revision: 0, payload: null });
  });

  it("rejects source or preference changes after a note is locked", async () => {
    const base = await startApi();
    const login = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "admin-test", password: "admin-secret" }),
    });
    const cookie = cookieFrom(login);
    const lockedPayload = {
      format: "river-backup",
      version: 2,
      notes: [{ id: "note-1", generationState: "completed", sourcesLockedAt: "2026-10-22T00:00:00.000Z" }],
      sources: [{ id: "source-1", noteId: "note-1", fileName: "a.pdf", order: 0, parseStatus: "parsed", textCharCount: 100 }],
      profiles: [{ noteId: "note-1", intent: "rough", level: "zero", purpose: "systematic", lockedAt: "2026-10-22T00:00:00.000Z" }],
    };
    const first = await fetch(`${base}/api/workspace`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ expectedRevision: 0, payload: lockedPayload }),
    });
    expect(first.status).toBe(200);
    const changed = await fetch(`${base}/api/workspace`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ expectedRevision: 1, payload: { ...lockedPayload, sources: [{ ...lockedPayload.sources[0], order: 1 }] } }),
    });
    expect(changed.status).toBe(423);
  });
});
