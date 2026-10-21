import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import {
  expandNodeSchema,
  knowledgeTreeSchema,
  learningIntroductionSchema,
  learningProfileSchema,
  regenerateBlockSchema,
  simplifyBlockSchema,
} from "./schemas";

export type AIProviderName = "openai" | "deepseek" | "opencode-go";

export const KAKOUAI_BASE_URL = "https://api.kakouai.com";
export const DEEPSEEK_MODEL_ID = "deepseek-v4.1-flash";
export const OPENCODE_GO_BASE_URL = "https://opencode.ai/zen/go/v1";

export const SUPPORTED_MODELS = {
  openai: ["gpt-6-luna"],
  deepseek: [DEEPSEEK_MODEL_ID],
  "opencode-go": [
    "deepseek-v4.1-flash",
    "deepseek-v4-pro",
    "deepseek-v4-flash",
    "gpt-6-luna",
    "glm-5.3",
    "glm-5.3-flash",
    "kimi-k2.7-code",
    "mimo-v2.6-pro",
    "mimo-v2.6-flash",
    "minimax-m3",
    "qwen3.8-max",
    "qwen3.8-flash",
  ],
} as const;

export const DEFAULT_MODEL = "gpt-6-luna";
export const OPENAI_PRICING = {
  inputPerMillion: 0.1,
  cachedInputPerMillion: 0.01,
  cacheWritePerMillion: 0.125,
  outputPerMillion: 0.5,
  currency: "USD" as const,
};

export const DEEPSEEK_PRICING = {
  idle: {
    cachedInputPerMillion: 0.02,
    inputPerMillion: 1,
    outputPerMillion: 4,
  },
  peak: {
    cachedInputPerMillion: 0.04,
    inputPerMillion: 2,
    outputPerMillion: 8,
  },
  currency: "CNY" as const,
};

export const OPENCODE_GO_PRICING = {
  plan: "OpenCode Go subscription",
  currency: "USD" as const,
};

export interface UsageSummary {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  estimatedCostUsd: number;
  estimatedCost: number;
  currency: "USD" | "CNY";
}

function isDeepSeekPeakTime(date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const weekday = parts.find((part) => part.type === "weekday")?.value || "Mon";
  const hour = Number(parts.find((part) => part.type === "hour")?.value || "0");
  const weekdayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
  const isWeekday = weekdayIndex >= 1 && weekdayIndex <= 5;
  return isWeekday && ((hour >= 9 && hour < 12) || (hour >= 14 && hour < 18));
}

export function summarizeUsage(provider: AIProviderName, usage?: any): UsageSummary {
  const usesChatUsage = provider === "deepseek" || provider === "opencode-go";
  const inputTokens = usesChatUsage ? usage?.prompt_tokens ?? 0 : usage?.input_tokens ?? 0;
  const outputTokens = usesChatUsage ? usage?.completion_tokens ?? 0 : usage?.output_tokens ?? 0;
  const cachedInputTokens =
    usesChatUsage
      ? usage?.prompt_tokens_details?.cached_tokens ?? usage?.prompt_cache_hit_tokens ?? 0
      : usage?.input_tokens_details?.cached_tokens ?? 0;
  const uncachedInput = Math.max(0, inputTokens - cachedInputTokens);

  if (provider === "opencode-go") {
    return {
      inputTokens,
      outputTokens,
      cachedInputTokens,
      estimatedCostUsd: 0,
      estimatedCost: 0,
      currency: "USD",
    };
  }

  if (provider === "deepseek") {
    const pricing = isDeepSeekPeakTime() ? DEEPSEEK_PRICING.peak : DEEPSEEK_PRICING.idle;
    const estimatedCost =
      (cachedInputTokens / 1_000_000) * pricing.cachedInputPerMillion +
      (uncachedInput / 1_000_000) * pricing.inputPerMillion +
      (outputTokens / 1_000_000) * pricing.outputPerMillion;
    return {
      inputTokens,
      outputTokens,
      cachedInputTokens,
      estimatedCostUsd: 0,
      estimatedCost: Number(estimatedCost.toFixed(6)),
      currency: "CNY",
    };
  }

  const estimatedCostUsd =
    (uncachedInput / 1_000_000) * OPENAI_PRICING.inputPerMillion +
    (cachedInputTokens / 1_000_000) * OPENAI_PRICING.cachedInputPerMillion +
    (outputTokens / 1_000_000) * OPENAI_PRICING.outputPerMillion;
  return {
    inputTokens,
    outputTokens,
    cachedInputTokens,
    estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
    estimatedCost: Number(estimatedCostUsd.toFixed(6)),
    currency: "USD",
  };
}

function createClient(provider: AIProviderName, apiKey: string, sessionId?: string): OpenAI {
  const headers = provider === "opencode-go" && sessionId ? { "x-opencode-session": sessionId } : undefined;
  return new OpenAI({
    apiKey,
    ...(provider === "deepseek" ? { baseURL: process.env.DEEPSEEK_BASE_URL || KAKOUAI_BASE_URL } : {}),
    ...(provider === "opencode-go" ? { baseURL: process.env.OPENCODE_GO_BASE_URL || OPENCODE_GO_BASE_URL } : {}),
    ...(headers ? { defaultHeaders: headers } : {}),
    timeout: 180_000,
    maxRetries: 1,
  });
}

function compactSource(sourceText: string, maxChars = 120_000): string {
  const trimmed = sourceText.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const head = trimmed.slice(0, Math.floor(maxChars * 0.65));
  const tail = trimmed.slice(-Math.floor(maxChars * 0.25));
  return `${head}\n\n[...中间内容因单次请求上限已省略，完整内容保留在本地课件数据中...]\n\n${tail}`;
}

function safeJsonSchema(schema: z.ZodTypeAny): string {
  try {
    const converter = (z as any).toJSONSchema;
    if (typeof converter === "function") return JSON.stringify(converter(schema));
  } catch {
    // Fall through to the textual schema instruction.
  }
  return "请根据字段名、类型和系统说明生成严格的 JSON 对象。";
}

async function generateStructured<T>(options: {
  provider: AIProviderName;
  apiKey: string;
  model: string;
  schema: z.ZodType<T>;
  schemaName: string;
  system: string;
  user: string;
  effort?: "low" | "medium" | "high" | "max";
  maxTokens?: number;
  sessionId?: string;
}): Promise<{ data: T; usage: UsageSummary; model: string }> {
  const provider = options.provider;
  const model = options.model || defaultModelForProvider(provider);
  const client = createClient(provider, options.apiKey, options.sessionId);

  if (provider === "openai") {
    const response = await client.responses.parse({
      model,
      reasoning: { effort: options.effort === "max" ? "xhigh" : options.effort || "medium" },
      input: [
        { role: "system", content: options.system },
        { role: "user", content: options.user },
      ],
      text: { format: zodTextFormat(options.schema, options.schemaName) },
    });
    if (!response.output_parsed) throw new Error("模型没有返回可解析的结构化内容。");
    return {
      data: response.output_parsed,
      usage: summarizeUsage("openai", response.usage),
      model,
    };
  }

  const schemaInstruction = safeJsonSchema(options.schema);
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const system = [
      options.system,
      "你只输出合法 JSON，不要输出 Markdown 代码块，不要输出 JSON 以外的解释。",
      `必须满足以下 JSON Schema：${schemaInstruction}`,
      lastError ? `上一次输出无法通过校验，错误：${lastError}` : "",
    ].filter(Boolean).join("\n");
    const response: any = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: options.user },
      ],
      response_format: { type: "json_object" },
      reasoning_effort: options.effort === "max" ? "max" : options.effort === "low" ? "low" : "high",
      max_tokens: options.maxTokens || 16_000,
      stream: false,
      ...(provider === "deepseek" ? { thinking: { type: "enabled" } } : {}),
    } as any);
    const content = response?.choices?.[0]?.message?.content;
    try {
      const json = JSON.parse(typeof content === "string" ? content : "");
      const parsed = options.schema.parse(json);
      return {
        data: parsed,
        usage: summarizeUsage(provider, response.usage),
        model,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(`${provider === "deepseek" ? "卡扣 AI" : "OpenCode Go"} 返回内容不符合 Schema：${lastError}`);
}

function defaultModelForProvider(provider: AIProviderName): string {
  if (provider === "deepseek") return DEEPSEEK_MODEL_ID;
  if (provider === "opencode-go") return "deepseek-v4.1-flash";
  return DEFAULT_MODEL;
}

export async function validateApiKey(provider: AIProviderName, apiKey: string, model: string, sessionId?: string) {
  const client = createClient(provider, apiKey, sessionId);
  if (provider === "deepseek" || provider === "opencode-go") {
    const response = await client.models.list();
    const ids = response.data.map((item) => item.id);
    if (ids.length && !ids.includes(model)) {
      const providerName = provider === "deepseek" ? "卡扣 AI" : "OpenCode Go";
      const error = new Error(`当前 ${providerName} API Key 可用模型中没有 ${model}。`) as Error & { status?: number };
      error.status = 400;
      throw error;
    }
    return { ok: true, model };
  }
  const response = await client.models.retrieve(model);
  return { ok: true, model: response.id };
}

export async function generateLearningOpening(input: {
  provider: AIProviderName;
  apiKey: string;
  model?: string;
  sessionId?: string;
  sourceText: string;
  profile: unknown;
}) {
  const profile = learningProfileSchema.parse(input.profile);
  return generateStructured({
    provider: input.provider,
    apiKey: input.apiKey,
    model: input.model || defaultModelForProvider(input.provider),
    sessionId: input.sessionId,
    schema: learningIntroductionSchema,
    schemaName: "learning_introduction",
    effort: "high",
    maxTokens: 32_000,
    system: [
      "你是 River 的学习开场设计器。",
      "你的任务不是写摘要，而是为学习者生成一张可确认的学习地图和一组可带走的问题。",
      "必须基于提供的课件内容，不得编造页码、章节或课件中不存在的事实。",
      "如果课件没有明确页码或幻灯片号，可以省略对应字段。",
      "重点、难点是建议，不是绝对事实。",
      "提问式目标要由浅入深，帮助用户形成正确的理解方向。",
    ].join("\n"),
    user: [
      `学习意图：${profile.intent}`,
      `用户程度：${profile.level}${profile.customLevel ? `（补充：${profile.customLevel}）` : ""}`,
      `学习用途：${profile.purpose}${profile.customPurpose ? `（补充：${profile.customPurpose}）` : ""}`,
      `目标呈现偏好：${profile.goalStyle}`,
      "",
      "课件内容：",
      compactSource(input.sourceText),
    ].join("\n"),
  });
}

export async function generateKnowledgeTree(input: {
  provider: AIProviderName;
  apiKey: string;
  model?: string;
  sessionId?: string;
  sourceText: string;
  profile: unknown;
  introduction: unknown;
}) {
  const profile = learningProfileSchema.parse(input.profile);
  return generateStructured({
    provider: input.provider,
    apiKey: input.apiKey,
    model: input.model || defaultModelForProvider(input.provider),
    sessionId: input.sessionId,
    schema: knowledgeTreeSchema,
    schemaName: "knowledge_tree",
    effort: "high",
    maxTokens: 96_000,
    system: [
      "你是 River 的知识树生成器。",
      "River 的知识树不是普通 Mind Map，节点必须能承载完整知识解释。",
      "每个节点必须包含 blocks，block 类型只能使用 Schema 中的枚举。",
      "定义、解释、例子、公式、补充、我的理解、易错点要按内容类型区分。",
      "必须尽量为节点和内容块提供 pageNumber 或 slideNumber 来源。",
      "不得编造课件中没有的依据；无法确认来源时省略 sourceRefs，不要伪造页码。",
      "内容详略必须服从学习意图、用户程度和学习用途。",
    ].join("\n"),
    user: [
      `学习意图：${profile.intent}`,
      `用户程度：${profile.level}${profile.customLevel ? `（补充：${profile.customLevel}）` : ""}`,
      `学习用途：${profile.purpose}${profile.customPurpose ? `（补充：${profile.customPurpose}）` : ""}`,
      "学习开场（已生成，可作为结构参考）：",
      JSON.stringify(input.introduction).slice(0, 12_000),
      "",
      "课件内容：",
      compactSource(input.sourceText, 150_000),
    ].join("\n"),
  });
}

export async function regenerateBlock(input: {
  provider: AIProviderName;
  apiKey: string;
  model?: string;
  sessionId?: string;
  nodeTitle: string;
  blockType: string;
  currentText: string;
  context?: string;
}) {
  return generateStructured({
    provider: input.provider,
    apiKey: input.apiKey,
    model: input.model || defaultModelForProvider(input.provider),
    sessionId: input.sessionId,
    schema: regenerateBlockSchema,
    schemaName: "regenerated_block",
    effort: "high",
    maxTokens: 12_000,
    system: [
      "你是 River 的知识点重写器。",
      "重新生成同一层级内容时，不能只替换同义词。",
      "如果是解释，必须换一条理解路径；如果是例子，必须换一个真正不同的例子。",
      "不要改写用户没有指定的节点。",
    ].join("\n"),
    user: [
      `节点标题：${input.nodeTitle}`,
      `内容类型：${input.blockType}`,
      `当前内容：${input.currentText}`,
      input.context ? `上下文：${input.context.slice(0, 8000)}` : "",
    ].join("\n"),
  });
}

export async function simplifyBlock(input: {
  provider: AIProviderName;
  apiKey: string;
  model?: string;
  sessionId?: string;
  nodeTitle: string;
  currentText: string;
  context?: string;
}) {
  return generateStructured({
    provider: input.provider,
    apiKey: input.apiKey,
    model: input.model || defaultModelForProvider(input.provider),
    sessionId: input.sessionId,
    schema: simplifyBlockSchema,
    schemaName: "simplified_block",
    effort: "low",
    maxTokens: 12_000,
    system: [
      "你是 River 的说人话解释器。",
      "用更通俗、更容易理解的语言解释当前内容。",
      "降低认知负荷，但不要牺牲关键准确性。",
      "不要改写用户没有指定的节点。",
    ].join("\n"),
    user: [
      `节点标题：${input.nodeTitle}`,
      `当前内容：${input.currentText}`,
      input.context ? `上下文：${input.context.slice(0, 8000)}` : "",
    ].join("\n"),
  });
}

export async function expandNode(input: {
  provider: AIProviderName;
  apiKey: string;
  model?: string;
  sessionId?: string;
  nodeTitle: string;
  currentText: string;
  context?: string;
}) {
  return generateStructured({
    provider: input.provider,
    apiKey: input.apiKey,
    model: input.model || defaultModelForProvider(input.provider),
    sessionId: input.sessionId,
    schema: expandNodeSchema,
    schemaName: "expanded_node",
    effort: "high",
    maxTokens: 32_000,
    system: [
      "你是 River 的知识点展开器。",
      "在当前知识点基础上生成更深入的解释，并可以在必要时生成最多 10 个子知识点。",
      "不要重写整个知识树，只处理指定节点。",
      "不得编造课件中没有的依据。",
    ].join("\n"),
    user: [
      `节点标题：${input.nodeTitle}`,
      `当前内容：${input.currentText}`,
      input.context ? `上下文：${input.context.slice(0, 12000)}` : "",
    ].join("\n"),
  });
}

export function parseSourceForModel(source: { pages?: Array<{ pageNumber: number; text: string }>; slides?: Array<{ slideNumber: number; text: string }> }) {
  if (source.pages?.length) {
    return source.pages.map((page) => `[第 ${page.pageNumber} 页]\n${page.text}`).join("\n\n");
  }
  if (source.slides?.length) {
    return source.slides.map((slide) => `[第 ${slide.slideNumber} 张幻灯片]\n${slide.text}`).join("\n\n");
  }
  return "";
}
