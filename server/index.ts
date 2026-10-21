import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
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
  generateKnowledgeTree,
  generateLearningOpening,
  regenerateBlock,
  simplifyBlock,
  validateApiKey,
} from "./ai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8788);
const CC_SWITCH_OPENCODE_PROVIDER_ID = "fcb21a00-52ef-45d6-9219-a19b181547be";

export function createApp() {
  const app = express();

  app.use(express.json({ limit: "3mb" }));

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
    service: "river-v0.1",
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
  createApp().listen(port, "127.0.0.1", () => {
    console.log(`River API listening on http://127.0.0.1:${port}`);
  });
}
