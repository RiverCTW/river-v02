import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { clearedSessionCookie, createPersistence, sessionCookie, type AuthUser } from "./persistence";
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
  generateCompleteLearningPackage,
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

  app.use(express.json({ limit: "50mb" }));

function cookieValue(req: express.Request, name: string): string | null {
  const raw = req.header("cookie") || "";
  const item = raw.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : null;
}

async function currentUser(req: express.Request): Promise<AuthUser | null> {
  const persistence = await persistencePromise;
  if (process.env.RIVER_E2E_BYPASS_AUTH === "1") return persistence.firstAdmin();
  return persistence.userForSession(cookieValue(req, "river_session"));
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
  res.setHeader("Set-Cookie", sessionCookie(token));
  res.json({ authenticated: true, user });
});

app.post("/api/auth/logout", async (req, res) => {
  const persistence = await persistencePromise;
  await persistence.deleteSession(cookieValue(req, "river_session"));
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
const generationJobs = new Map<string, {
  userId: string;
  status: "running" | "completed" | "failed";
  progress: number;
  message: string;
  result?: unknown;
  error?: string;
  updatedAt: number;
}>();
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
    service: "riverv0.2",
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
  const apiKey = getApiKey(req);
  const provider = getProvider(req);
  const user = (req as express.Request & { riverUser: AuthUser }).riverUser;
  if (!apiKey) return sendError(res, new Error("缺少 API Key。"), 400);
  if (!rateLimit(`full-package:${apiKey.slice(-8)}`, 10)) return sendError(res, new Error("请求过于频繁，请稍后再试。"), 429);
  const jobId = randomUUID();
  generationJobs.set(jobId, { userId: user.id, status: "running", progress: 3, message: "正在准备生成任务…", updatedAt: Date.now() });
  void generateCompleteLearningPackage({
      apiKey,
      provider,
      model: req.body?.model,
      sessionId: getAiSessionId(req),
      sourceText: String(req.body?.sourceText || ""),
      profile: req.body?.profile,
      introduction: req.body?.introduction,
      onProgress: (progress, message) => generationJobs.set(jobId, { userId: user.id, status: "running", progress, message, updatedAt: Date.now() }),
    }).then((result) => {
      generationJobs.set(jobId, { userId: user.id, status: "completed", progress: 100, message: "知识树和两张学习地图已生成。", result, updatedAt: Date.now() });
    }).catch((error) => {
      generationJobs.set(jobId, { userId: user.id, status: "failed", progress: 0, message: "生成失败。", error: error instanceof Error ? error.message : String(error), updatedAt: Date.now() });
    });
  res.status(202).json({ jobId, status: "running", progress: 3, message: "正在准备生成任务…" });
});

app.get("/api/ai/full-package/:jobId", requireUser, (req, res) => {
  const user = (req as express.Request & { riverUser: AuthUser }).riverUser;
  const jobId = String(req.params.jobId);
  const job = generationJobs.get(jobId);
  if (!job || job.userId !== user.id) return sendError(res, new Error("生成任务不存在或已过期。"), 404);
  if (Date.now() - job.updatedAt > 30 * 60 * 1000 && job.status !== "running") generationJobs.delete(jobId);
  res.json({ jobId, status: job.status, progress: job.progress, message: job.message, result: job.result, error: job.error });
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
