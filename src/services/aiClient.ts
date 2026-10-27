import { authHeaders } from "./sessionAuth";

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

export type GenerationJobStatus = "QUEUED" | "PARSING" | "PLANNING" | "GENERATING" | "MERGING" | "VALIDATING" | "SAVING" | "COMPLETED" | "FAILED" | "RETRY_PENDING" | "NEEDS_INPUT";

export interface GenerationJob {
  jobId: string;
  noteId: string;
  status: GenerationJobStatus;
  stage: string;
  progress: number;
  message: string;
  currentFile: string | null;
  pageRange: string | null;
  sectionTitle: string | null;
  completedSections: number;
  totalSections: number;
  totalPages: number;
  provider: string;
  model: string;
  errorCode: string | null;
  errorMessage: string | null;
  retryCount: number;
  requestedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  result?: AIResponse<FullLearningPackageData>;
}

export interface FullLearningPackageData {
  introduction: any;
  tree: any;
  chapterMap?: any;
  sections?: number;
  requirements?: { title: string; nodes: any[] };
  questions?: { title: string; nodes: any[] };
  batchCount: number;
  commit?: {
    note: any;
    profile: any;
    introduction: any;
    nodes: any[];
    blocks: any[];
    learningMaps: any[];
    workspaceRevision: number;
  };
}

export interface GenerationProgress {
  progress: number;
  message: string;
  job: GenerationJob;
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
      ...authHeaders(),
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

export async function startFullLearningPackage(provider: string, apiKey: string, model: string, input: Record<string, unknown>): Promise<GenerationJob> {
  const usesCcSwitch = provider === "opencode-go" && apiKey === CC_SWITCH_LOCAL_KEY;
  const startResponse = await fetch("/api/ai/full-package", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      "x-ai-provider": provider,
      "x-ai-auth-source": usesCcSwitch ? "cc-switch" : "manual",
      ...(usesCcSwitch ? {} : { "x-ai-api-key": apiKey }),
      ...(provider === "opencode-go" ? { "x-opencode-session": openCodeSessionId } : {}),
    },
    body: JSON.stringify({ model, ...input }),
  });
  const started = await startResponse.json().catch(() => ({}));
  if (!startResponse.ok) throw new Error(started?.error?.message || `请求失败：HTTP ${startResponse.status}`);
  if (!started?.jobId) throw new Error("服务端没有返回生成任务 ID。");
  return started as GenerationJob;
}

export async function getFullLearningPackageJob(jobId: string): Promise<GenerationJob> {
  const response = await fetch(`/api/ai/full-package/${encodeURIComponent(jobId)}`, { credentials: "same-origin", headers: authHeaders() });
  const job = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(job?.error?.message || `请求失败：HTTP ${response.status}`) as Error & { status?: number; code?: string };
    error.status = response.status;
    error.code = job?.error?.code;
    throw error;
  }
  return job as GenerationJob;
}

export async function getActiveFullLearningPackageJob(noteId: string): Promise<GenerationJob | null> {
  const response = await fetch(`/api/ai/full-package/active?noteId=${encodeURIComponent(noteId)}`, { credentials: "same-origin", headers: authHeaders() });
  if (response.status === 404) return null;
  const job = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(job?.error?.message || `请求失败：HTTP ${response.status}`);
  if (!job?.jobId) return null;
  return job as GenerationJob;
}

export async function cancelFullLearningPackage(noteId: string): Promise<boolean> {
  const response = await fetch("/api/ai/full-package/cancel", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ noteId }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `请求失败：HTTP ${response.status}`);
  return Boolean(payload?.cancelled);
}

export async function waitForFullLearningPackage(jobId: string, onProgress?: (progress: GenerationProgress) => void): Promise<AIResponse<FullLearningPackageData>> {
  const unavailableSince = Date.now();
  let consecutiveNetworkFailures = 0;
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    let job: GenerationJob;
    try {
      job = await getFullLearningPackageJob(jobId);
      consecutiveNetworkFailures = 0;
    } catch (error) {
      const typed = error as Error & { status?: number; code?: string };
      const transient = !typed.status || typed.status >= 500;
      if (transient && Date.now() - unavailableSince < 30 * 60 * 1000) {
        consecutiveNetworkFailures += 1;
        onProgress?.({
          progress: 0,
          message: consecutiveNetworkFailures < 3 ? "正在重新连接后台任务…" : "网络或服务器暂时不可用，后台任务仍会继续。",
          job: {
            jobId, noteId: "", status: "RETRY_PENDING", stage: "RECONNECTING", progress: 0,
            message: "正在重新连接后台任务…", currentFile: null, pageRange: null, sectionTitle: null,
            completedSections: 0, totalSections: 0, totalPages: 0, provider: "", model: "",
            errorCode: "generation_poll_unavailable", errorMessage: typed.message, retryCount: consecutiveNetworkFailures,
            requestedAt: "", updatedAt: new Date().toISOString(), finishedAt: null,
          },
        });
        continue;
      }
      const unavailable = new Error(typed.message || "后台任务状态暂时无法读取。") as Error & { code?: string; status?: number };
      unavailable.code = "generation_poll_unavailable";
      unavailable.status = typed.status;
      throw unavailable;
    }
    onProgress?.({ progress: Number(job.progress || 0), message: String(job.message || "正在生成…"), job });
    if (job.status === "COMPLETED" && job.result) return job.result;
    if (job.status === "FAILED") throw new Error(job.errorMessage || "生成失败。");
    if (job.status === "NEEDS_INPUT") throw new Error(job.errorMessage || "生成任务需要补充输入。");
  }
}

export async function generateFullLearningPackage(
  provider: string,
  apiKey: string,
  model: string,
  input: Record<string, unknown>,
  onProgress?: (progress: GenerationProgress) => void,
): Promise<AIResponse<FullLearningPackageData>> {
  const started = await startFullLearningPackage(provider, apiKey, model, input);
  const storageKey = `river.generation-job.${String(input.noteId || "")}`;
  if (typeof sessionStorage !== "undefined") sessionStorage.setItem(storageKey, started.jobId);
  onProgress?.({ progress: started.progress, message: started.message, job: started });
  try {
    return await waitForFullLearningPackage(started.jobId, onProgress);
  } finally {
    if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(storageKey);
  }
}

export async function generateChatAnswer(provider: string, apiKey: string, model: string, input: Record<string, unknown>): Promise<AIResponse<{ answer: string; citations: string[] }>> {
  return post("/ai/chat", provider, apiKey, { model, ...input });
}
