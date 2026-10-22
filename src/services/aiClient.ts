export interface AIUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  estimatedCostUsd: number;
  estimatedCost?: number;
  currency?: "USD" | "CNY";
}

export interface AIResponse<T> {
  data: T;
  usage: AIUsage;
  model: string;
}

export const CC_SWITCH_LOCAL_KEY = "__river_cc_switch_local__";

const openCodeSessionId = typeof crypto !== "undefined" && "randomUUID" in crypto
  ? crypto.randomUUID()
  : `river-${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function post<T = any>(path: string, provider: string, apiKey: string, body: unknown): Promise<AIResponse<T>> {
  const usesCcSwitch = provider === "opencode-go" && apiKey === CC_SWITCH_LOCAL_KEY;
  const response = await fetch(`/api${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ai-provider": provider,
      "x-ai-auth-source": usesCcSwitch ? "cc-switch" : "manual",
      ...(usesCcSwitch ? {} : { "x-ai-api-key": apiKey }),
      ...(provider === "opencode-go" ? { "x-opencode-session": openCodeSessionId } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = json?.error?.message || `请求失败：HTTP ${response.status}`;
    const error = new Error(message) as Error & { code?: string; status?: number };
    error.code = json?.error?.code;
    error.status = response.status;
    throw error;
  }
  return json as AIResponse<T>;
}

export async function validateKey(provider: string, apiKey: string, model: string) {
  return post<{ ok: true; model: string }>("/ai/validate-key", provider, apiKey, { model }) as unknown as Promise<{ ok: true; model: string }>;
}

export async function generateOpening(provider: string, apiKey: string, model: string, sourceText: string, profile: unknown): Promise<AIResponse<any>> {
  return post("/ai/opening", provider, apiKey, { model, sourceText, profile });
}

export async function generateTree(provider: string, apiKey: string, model: string, sourceText: string, profile: unknown, introduction: unknown): Promise<AIResponse<any>> {
  return post("/ai/tree", provider, apiKey, { model, sourceText, profile, introduction });
}

export async function regenerateBlock(provider: string, apiKey: string, model: string, input: Record<string, unknown>): Promise<AIResponse<{ text: string; rationale: string }>> {
  return post("/ai/regenerate", provider, apiKey, { model, ...input });
}

export async function simplifyBlock(provider: string, apiKey: string, model: string, input: Record<string, unknown>): Promise<AIResponse<{ text: string }>> {
  return post("/ai/simplify", provider, apiKey, { model, ...input });
}

export async function expandNode(provider: string, apiKey: string, model: string, input: Record<string, unknown>): Promise<AIResponse<{ explanation: string; children: Array<{ title: string; blocks: Array<{ type: any; text: string; sourceRefs: any[] }> }> }>> {
  return post("/ai/expand", provider, apiKey, { model, ...input });
}

export async function generateFullLearningPackage(provider: string, apiKey: string, model: string, input: Record<string, unknown>, onProgress?: (progress: number, message: string) => void): Promise<AIResponse<{
  introduction: any;
  tree: any;
  requirements: { title: string; nodes: any[] };
  questions: { title: string; nodes: any[] };
  batchCount: number;
}>> {
  const usesCcSwitch = provider === "opencode-go" && apiKey === CC_SWITCH_LOCAL_KEY;
  const startResponse = await fetch("/api/ai/full-package", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ai-provider": provider,
      "x-ai-auth-source": usesCcSwitch ? "cc-switch" : "manual",
      ...(usesCcSwitch ? {} : { "x-ai-api-key": apiKey }),
      ...(provider === "opencode-go" ? { "x-opencode-session": openCodeSessionId } : {}),
    },
    body: JSON.stringify({ model, ...input }),
  });
  const started = await startResponse.json().catch(() => ({}));
  if (!startResponse.ok) throw new Error(started?.error?.message || `请求失败：HTTP ${startResponse.status}`);
  const jobId = String(started.jobId || "");
  if (!jobId) throw new Error("服务端没有返回生成任务 ID。");
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const response = await fetch(`/api/ai/full-package/${encodeURIComponent(jobId)}`, { credentials: "same-origin" });
    const job = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(job?.error?.message || `请求失败：HTTP ${response.status}`);
    onProgress?.(Number(job.progress || 0), String(job.message || "正在生成…"));
    if (job.status === "completed") return job.result as AIResponse<any>;
    if (job.status === "failed") throw new Error(job.error || "生成失败。");
  }
}

export async function generateChatAnswer(provider: string, apiKey: string, model: string, input: Record<string, unknown>): Promise<AIResponse<{ answer: string; citations: string[] }>> {
  return post("/ai/chat", provider, apiKey, { model, ...input });
}
