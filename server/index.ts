import express from "express";
import compression from "compression";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { clearedSessionCookie, createPersistence, type AuthUser } from "./persistence";
import { cancelActiveGenerationJob, encryptGenerationCredential, launchGenerationJob, newGenerationJobId, publicGenerationJob, resumeGenerationJobs } from "./generationJobs";
import {
  DEFAULT_MODEL,
  DEEPSEEK_MODEL_ID,
  KAKOUAI_BASE_URL,
  OPENCODE_GO_BASE_URL,
  OPENCODE_GO_PRICING,
  OPENAI_PRICING,
  DEEPSEEK_PRICING,
  SUPPORTED_MODELS,
  expandNode,
  generateChatAnswer,
  generateKnowledgeTree,
  generateLearningOpening,
  regenerateBlock,
  simplifyBlock,
  validateApiKey,
} from "./ai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8792);
const CC_SWITCH_OPENCODE_PROVIDER_ID = "fcb21a00-52ef-45d6-9219-a19b181547be";

export function createApp() {
  const app = express();
  const persistencePromise = createPersistence();
  void persistencePromise
    .then((persistence) => resumeGenerationJobs(persistence))
    .catch((error) => console.error("River generation recovery failed", error));

  app.use(compression());
  app.use(express.json({ limit: "50mb" }));

function cookieValue(req: express.Request, name: string): string | null {
  const raw = req.header("cookie") || "";
  const item = raw.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : null;
}

async function currentUser(req: express.Request): Promise<AuthUser | null> {
  const persistence = await persistencePromise;
  if (process.env.RIVER_E2E_BYPASS_AUTH === "1") return persistence.firstAdmin();
  const authorization = req.header("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : null;
  return persistence.userForSession(token);
}

async function requireUser(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = await currentUser(req);
  if (!user) return sendError(res, new Error("请先登录 River。"), 401);
  (req as express.Request & { riverUser?: AuthUser }).riverUser = user;
  next();
}

async function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = await currentUser(req);
  if (!user) return sendError(res, new Error("请先登录 River。"), 401);
  if (user.role !== "admin") return sendError(res, new Error("需要管理员权限。"), 403);
  (req as express.Request & { riverUser?: AuthUser }).riverUser = user;
  next();
}

app.get("/api/auth/me", async (req, res) => {
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ authenticated: false });
  res.json({ authenticated: true, user });
});

app.post("/api/auth/login", async (req, res) => {
  const persistence = await persistencePromise;
  const username = String(req.body?.username || "");
  const password = String(req.body?.password || "");
  const user = await persistence.authenticate(username, password);
  if (!user) return sendError(res, new Error("用户名或密码不正确。"), 401);
  const token = await persistence.createSession(user.id);
  // Clear the legacy browser-wide cookie; v0.21 uses a tab-scoped Bearer token.
  res.setHeader("Set-Cookie", clearedSessionCookie);
  res.json({ authenticated: true, user, sessionToken: token });
});

app.post("/api/auth/tab", requireUser, async (req, res) => {
  const persistence = await persistencePromise;
  const user = (req as express.Request & { riverUser: AuthUser }).riverUser;
  const token = await persistence.createSession(user.id);
  res.setHeader("Set-Cookie", clearedSessionCookie);
  res.json({ authenticated: true, user, sessionToken: token });
});

app.post("/api/auth/logout", async (req, res) => {
  const persistence = await persistencePromise;
  const authorization = req.header("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : null;
  await persistence.deleteSession(token);
  res.setHeader("Set-Cookie", clearedSessionCookie);
  res.json({ ok: true });
});

app.get("/api/admin/users", requireAdmin, async (_req, res) => {
  const persistence = await persistencePromise;
  res.json({ users: await persistence.listUsers() });
});

app.post("/api/admin/users", requireAdmin, async (req, res) => {
  const persistence = await persistencePromise;
  try {
    const user = await persistence.createUser(String(req.body?.username || ""), String(req.body?.password || ""), "user");
    res.status(201).json({ user });
  } catch (error) {
    sendError(res, error, 400);
  }
});

/**
 * Admin-only maintenance: permanently purge every note in the root of a
 * user's library, including notes already in the trash. All child records are
 * removed and the note IDs are written to deletedNoteIds so a stale client
 * cache can never resurrect them on the next sync.
 */
app.post("/api/admin/purge-root-notes", requireAdmin, async (req, res) => {
  const persistence = await persistencePromise;
  const username = String(req.body?.username || "").trim();
  if (!username) return sendError(res, new Error("请提供 username。"), 400);
  const users = await persistence.listUsers();
  const user = users.find((item) => item.username === username);
  if (!user) return sendError(res, new Error(`用户 ${username} 不存在。`), 404);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const workspace = await persistence.getWorkspace(user.id);
    const payload = workspace.payload as any;
    if (!payload) return sendError(res, new Error("该用户工作区为空。"), 404);
    const rootNotes = (payload.notes || []).filter((note: any) => !note.folderId);
    if (!rootNotes.length) {
      return res.json({ deleted: 0, noteIds: [], deletedNoteIds: payload.deletedNoteIds || [], revision: workspace.revision });
    }
    const ids = new Set(rootNotes.map((note: any) => note.id));
    const keep = (item: any) => !ids.has(item?.noteId) && !ids.has(item?.id);
    const deletedNoteIds = [...new Set([...(payload.deletedNoteIds || []), ...ids])];
    const nextPayload = {
      ...payload,
      notes: (payload.notes || []).filter((note: any) => !ids.has(note.id)),
      sources: (payload.sources || []).filter(keep),
      profiles: (payload.profiles || []).filter(keep),
      introductions: (payload.introductions || []).filter(keep),
      nodes: (payload.nodes || []).filter(keep),
      blocks: (payload.blocks || []).filter(keep),
      learningMaps: (payload.learningMaps || []).filter(keep),
      chatMessages: (payload.chatMessages || []).filter(keep),
      deletedNoteIds,
    };
    try {
      const saved = await persistence.putWorkspace(user.id, workspace.revision, nextPayload);
      return res.json({ deleted: ids.size, noteIds: [...ids], deletedNoteIds, revision: saved.revision });
    } catch (error) {
      const typed = error as { status?: number; code?: string };
      if (typed.status !== 409 && typed.code !== "workspace_revision_conflict") throw error;
    }
  }
  return sendError(res, new Error("工作区版本冲突，未完成永久删除。"), 409);
});

/**
 * Admin-only maintenance: soft-delete every active note that lives directly in
 * the root of a user's library (folderId null). Notes inside any folder are
 * untouched, and data is soft-deleted so it can still be restored.
 */
app.post("/api/admin/delete-root-notes", requireAdmin, async (req, res) => {
  const persistence = await persistencePromise;
  const username = String(req.body?.username || "").trim();
  if (!username) return sendError(res, new Error("请提供 username。"), 400);
  const users = await persistence.listUsers();
  const user = users.find((item) => item.username === username);
  if (!user) return sendError(res, new Error(`用户 ${username} 不存在。`), 404);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const workspace = await persistence.getWorkspace(user.id);
    const payload = workspace.payload as any;
    if (!payload) return sendError(res, new Error("该用户工作区为空。"), 404);
    const rootNotes = (payload.notes || []).filter((note: any) => !note.deletedAt && !note.folderId);
    if (!rootNotes.length) return res.json({ deleted: 0, noteIds: [], revision: workspace.revision });
    const ids = new Set(rootNotes.map((note: any) => note.id));
    const now = new Date().toISOString();
    const nextPayload = {
      ...payload,
      notes: (payload.notes || []).map((note: any) => ids.has(note.id) ? { ...note, deletedAt: now } : note),
    };
    try {
      const saved = await persistence.putWorkspace(user.id, workspace.revision, nextPayload);
      return res.json({ deleted: rootNotes.length, noteIds: [...ids], revision: saved.revision });
    } catch (error) {
      const typed = error as { status?: number; code?: string };
      if (typed.status !== 409 && typed.code !== "workspace_revision_conflict") throw error;
    }
  }
  return sendError(res, new Error("工作区版本冲突，未完成删除。"), 409);
});

app.get("/api/workspace", requireUser, async (req, res) => {
  const persistence = await persistencePromise;
  const user = (req as express.Request & { riverUser: AuthUser }).riverUser;
  res.json(await persistence.getWorkspace(user.id));
});

app.put("/api/workspace", requireUser, async (req, res) => {
  const persistence = await persistencePromise;
  try {
    const user = (req as express.Request & { riverUser: AuthUser }).riverUser;
    const expectedRevision = Number(req.body?.expectedRevision);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) throw new Error("expectedRevision 无效。");
    const result = await persistence.putWorkspace(user.id, expectedRevision, req.body?.payload);
    res.json({ ok: true, ...result });
  } catch (error) {
    sendError(res, error, 400);
  }
});

const requestBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(key: string, limit = 30, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const bucket = requestBuckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    requestBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

function getApiKey(req: express.Request): string | null {
  if (req.header("x-ai-auth-source") === "cc-switch") {
    if (getProvider(req) !== "opencode-go") return null;
    if (!isLoopbackRequest(req)) return null;
    const key = readCcSwitchOpenCodeKey();
    if (!key) return null;
    return key;
  }
  const key = req.header("x-ai-api-key") || req.header("x-openai-api-key");
  return typeof key === "string" && key.trim() ? key.trim() : null;
}

function getProvider(req: express.Request): "openai" | "deepseek" | "opencode-go" {
  const provider = req.header("x-ai-provider");
  if (provider === "deepseek" || provider === "opencode-go") return provider;
  return "openai";
}

function isLoopbackRequest(req: express.Request): boolean {
  const originalHost = (req.header("x-river-request-host") || "").split(":")[0].toLowerCase();
  if (originalHost && originalHost !== "localhost" && originalHost !== "127.0.0.1" && originalHost !== "::1") {
    return false;
  }
  const host = (req.header("host") || "").split(":")[0].toLowerCase();
  if (
    host.endsWith("trycloudflare.com") ||
    req.header("cf-connecting-ip") ||
    req.header("cf-ray") ||
    req.header("forwarded") ||
    req.header("x-forwarded-for")
  ) {
    return false;
  }
  const address = req.socket.remoteAddress || "";
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function readCcSwitchOpenCodeKey(): string | null {
  const databasePath = path.join(process.env.HOME || "", ".cc-switch", "cc-switch.db");
  let database: DatabaseSync | null = null;
  try {
    database = new DatabaseSync(databasePath, { readOnly: true });
    const row = database.prepare(
      "select settings_config from providers where app_type = 'codex' and (name = 'OpenCode Go' or id = ?) order by is_current desc, created_at desc limit 1",
    ).get(CC_SWITCH_OPENCODE_PROVIDER_ID) as { settings_config?: string } | undefined;
    if (!row?.settings_config) return null;
    const settings = JSON.parse(row.settings_config) as { auth?: { OPENAI_API_KEY?: unknown } };
    const key = settings.auth?.OPENAI_API_KEY;
    return typeof key === "string" && key.trim() ? key.trim() : null;
  } catch {
    return null;
  } finally {
    database?.close();
  }
}

function getAiSessionId(req: express.Request): string | undefined {
  if (getProvider(req) !== "opencode-go") return undefined;
  const supplied = req.header("x-opencode-session");
  return supplied?.trim() || `river-${randomUUID()}`;
}

function sendError(res: express.Response, error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error);
  const anyError = error as { status?: number; code?: string; type?: string };
  res.status(anyError.status && anyError.status >= 400 && anyError.status < 600 ? anyError.status : status).json({
    error: {
      message,
      code: anyError.code || anyError.type || "river_ai_error",
    },
  });
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "riverv0.22.2",
    defaultModel: DEFAULT_MODEL,
    supportedModels: SUPPORTED_MODELS,
    ccSwitchOpenCodeConfigured: isLoopbackRequest(req) && Boolean(readCcSwitchOpenCodeKey()),
    opencodeGoBaseUrl: OPENCODE_GO_BASE_URL,
    deepseekBaseUrl: KAKOUAI_BASE_URL,
    pricing: {
      openai: OPENAI_PRICING,
      deepseek: DEEPSEEK_PRICING,
      "opencode-go": OPENCODE_GO_PRICING,
    },
  });
});

app.post("/api/ai/validate-key", async (req, res) => {
  const apiKey = getApiKey(req);
  const provider = getProvider(req);
  if (!apiKey) return sendError(res, new Error("缺少 API Key。"), 400);
  if (!rateLimit(`validate:${provider}:${apiKey.slice(-8)}`, 20)) return sendError(res, new Error("请求过于频繁，请稍后再试。"), 429);
  try {
    const result = await validateApiKey(
      provider,
      apiKey,
      String(req.body?.model || (provider === "deepseek" ? DEEPSEEK_MODEL_ID : provider === "opencode-go" ? "deepseek-v4.1-flash" : DEFAULT_MODEL)),
      getAiSessionId(req),
    );
    res.json(result);
  } catch (error) {
    sendError(res, error, 401);
  }
});

app.post("/api/ai/opening", async (req, res) => {
  const apiKey = getApiKey(req);
  const provider = getProvider(req);
  if (!apiKey) return sendError(res, new Error("缺少 API Key。"), 400);
  if (!rateLimit(`opening:${apiKey.slice(-8)}`)) return sendError(res, new Error("请求过于频繁，请稍后再试。"), 429);
  try {
    const result = await generateLearningOpening({
      apiKey,
      provider,
      model: req.body?.model,
      sessionId: getAiSessionId(req),
      sourceText: String(req.body?.sourceText || ""),
      profile: req.body?.profile,
    });
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/ai/tree", async (req, res) => {
  const apiKey = getApiKey(req);
  const provider = getProvider(req);
  if (!apiKey) return sendError(res, new Error("缺少 API Key。"), 400);
  if (!rateLimit(`tree:${apiKey.slice(-8)}`, 20)) return sendError(res, new Error("请求过于频繁，请稍后再试。"), 429);
  try {
    const result = await generateKnowledgeTree({
      apiKey,
      provider,
      model: req.body?.model,
      sessionId: getAiSessionId(req),
      sourceText: String(req.body?.sourceText || ""),
      profile: req.body?.profile,
      introduction: req.body?.introduction,
    });
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/ai/full-package", requireUser, async (req, res) => {
  const persistence = await persistencePromise;
  const apiKey = getApiKey(req);
  const provider = getProvider(req);
  const user = (req as express.Request & { riverUser: AuthUser }).riverUser;
  const noteId = String(req.body?.noteId || "").trim();
  if (!noteId) return sendError(res, new Error("缺少目标笔记 ID。"), 400);
  if (!apiKey) return sendError(res, new Error("缺少 API Key。"), 400);
  if (!rateLimit(`full-package:${apiKey.slice(-8)}`, 10)) return sendError(res, new Error("请求过于频繁，请稍后再试。"), 429);
  const workspace = await persistence.getWorkspace(user.id);
  const targetNote = ((workspace.payload as any)?.notes || []).find((note: any) => note.id === noteId);
  if (!targetNote || targetNote.deletedAt) {
    const error = new Error(targetNote?.deletedAt ? "目标笔记已被删除，无法开始生成。" : "目标笔记尚未同步到云端工作区，请稍后重试。") as Error & { status?: number; code?: string };
    error.status = 409;
    error.code = targetNote?.deletedAt ? "target_note_deleted" : "workspace_note_missing";
    return sendError(res, error, 409);
  }
  const existing = await persistence.getActiveGenerationJob(user.id, noteId);
  if (existing) {
    launchGenerationJob(persistence, existing.id);
    return res.status(202).json(publicGenerationJob(existing));
  }
  const credential = encryptGenerationCredential(apiKey);
  const job = await persistence.createGenerationJob({
    id: newGenerationJobId(), userId: user.id, noteId,
    provider, model: String(req.body?.model || ""),
    payloadJson: {
      sourceText: String(req.body?.sourceText || ""), profile: req.body?.profile,
      customization: String(req.body?.customization || ""), introduction: req.body?.introduction,
      sourceSnapshot: req.body?.sourceSnapshot,
      totalPages: Number(req.body?.totalPages || 0),
      sessionId: getAiSessionId(req),
      noteSnapshot: targetNote,
    },
    credentialCipher: credential.cipher, credentialIv: credential.iv, credentialTag: credential.tag,
  });
  launchGenerationJob(persistence, job.id);
  res.status(202).json(publicGenerationJob(job));
});

app.post("/api/ai/full-package/cancel", requireUser, async (req, res) => {
  const persistence = await persistencePromise;
  const user = (req as express.Request & { riverUser: AuthUser }).riverUser;
  const noteId = String(req.body?.noteId || "").trim();
  if (!noteId) return sendError(res, new Error("缺少目标笔记 ID。"), 400);
  const job = await cancelActiveGenerationJob(persistence, user.id, noteId);
  res.json({ cancelled: Boolean(job), job: job ? publicGenerationJob(job) : null });
});

app.get("/api/ai/full-package/active", requireUser, async (req, res) => {
  const persistence = await persistencePromise;
  const user = (req as express.Request & { riverUser: AuthUser }).riverUser;
  const noteId = String(req.query.noteId || "").trim();
  if (!noteId) return sendError(res, new Error("缺少目标笔记 ID。"), 400);
  const active = await persistence.getActiveGenerationJob(user.id, noteId);
  if (active) return res.json(publicGenerationJob(active));
  res.json({ active: false });
});

app.get("/api/ai/full-package/:jobId", requireUser, async (req, res) => {
  const persistence = await persistencePromise;
  const user = (req as express.Request & { riverUser: AuthUser }).riverUser;
  const job = await persistence.getGenerationJob(String(req.params.jobId), user.id);
  if (!job) return sendError(res, new Error("生成任务不存在或已过期。"), 404);
  res.json(publicGenerationJob(job));
});

app.post("/api/ai/chat", requireUser, async (req, res) => {
  const apiKey = getApiKey(req);
  const provider = getProvider(req);
  if (!apiKey) return sendError(res, new Error("缺少 API Key。"), 400);
  if (!rateLimit(`chat:${apiKey.slice(-8)}`, 80)) return sendError(res, new Error("请求过于频繁，请稍后再试。"), 429);
  try {
    const result = await generateChatAnswer({
      apiKey,
      provider,
      model: req.body?.model,
      sessionId: getAiSessionId(req),
      question: String(req.body?.question || ""),
      mode: req.body?.mode === "expanded" ? "expanded" : "sources",
      sourceText: String(req.body?.sourceText || ""),
      treeText: String(req.body?.treeText || ""),
      personalAnswers: String(req.body?.personalAnswers || ""),
      history: Array.isArray(req.body?.history) ? req.body.history : [],
    });
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/ai/regenerate", async (req, res) => {
  const apiKey = getApiKey(req);
  const provider = getProvider(req);
  if (!apiKey) return sendError(res, new Error("缺少 API Key。"), 400);
  if (!rateLimit(`regenerate:${apiKey.slice(-8)}`, 60)) return sendError(res, new Error("请求过于频繁，请稍后再试。"), 429);
  try {
    const result = await regenerateBlock({
      apiKey,
      provider,
      model: req.body?.model,
      sessionId: getAiSessionId(req),
      nodeTitle: String(req.body?.nodeTitle || ""),
      blockType: String(req.body?.blockType || "explanation"),
      currentText: String(req.body?.currentText || ""),
      context: String(req.body?.context || ""),
    });
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/ai/simplify", async (req, res) => {
  const apiKey = getApiKey(req);
  const provider = getProvider(req);
  if (!apiKey) return sendError(res, new Error("缺少 API Key。"), 400);
  if (!rateLimit(`simplify:${apiKey.slice(-8)}`, 60)) return sendError(res, new Error("请求过于频繁，请稍后再试。"), 429);
  try {
    const result = await simplifyBlock({
      apiKey,
      provider,
      model: req.body?.model,
      sessionId: getAiSessionId(req),
      nodeTitle: String(req.body?.nodeTitle || ""),
      currentText: String(req.body?.currentText || ""),
      context: String(req.body?.context || ""),
    });
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/ai/expand", async (req, res) => {
  const apiKey = getApiKey(req);
  const provider = getProvider(req);
  if (!apiKey) return sendError(res, new Error("缺少 API Key。"), 400);
  if (!rateLimit(`expand:${apiKey.slice(-8)}`, 40)) return sendError(res, new Error("请求过于频繁，请稍后再试。"), 429);
  try {
    const result = await expandNode({
      apiKey,
      provider,
      model: req.body?.model,
      sessionId: getAiSessionId(req),
      nodeTitle: String(req.body?.nodeTitle || ""),
      currentText: String(req.body?.currentText || ""),
      context: String(req.body?.context || ""),
    });
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

  if (process.env.NODE_ENV === "production") {
    const dist = path.resolve(__dirname, "../dist");
    app.use(express.static(dist));
    app.use((_req, res) => {
      res.sendFile(path.join(dist, "index.html"));
    });
  }

  return app;
}

const entryFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entryFile === fileURLToPath(import.meta.url)) {
  const host = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
  createApp().listen(port, host, () => {
    console.log(`River API listening on http://${host}:${port}`);
  });
}
