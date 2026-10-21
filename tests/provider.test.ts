import { afterEach, describe, expect, it, vi } from "vitest";
import { DEEPSEEK_PRICING, simplifyBlock, summarizeUsage, validateApiKey } from "../server/ai";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("DeepSeek provider adapter", () => {
  it("uses the official model, base URL path, JSON mode and thinking parameters", async () => {
    vi.stubEnv("DEEPSEEK_BASE_URL", "https://mock.deepseek.test");
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(url).toBe("https://mock.deepseek.test/chat/completions");
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer sk-test-deepseek");
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("deepseek-v4.1-flash");
      expect(body.response_format).toEqual({ type: "json_object" });
      expect(body.thinking).toEqual({ type: "enabled" });
      expect(body.stream).toBe(false);
      return jsonResponse({
        id: "chatcmpl-test",
        object: "chat.completion",
        created: 1,
        model: "deepseek-v4.1-flash",
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify({ text: "更容易理解的解释。" }) } }],
        usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150, prompt_cache_hit_tokens: 20 },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await simplifyBlock({
      provider: "deepseek",
      apiKey: "sk-test-deepseek",
      model: "deepseek-v4.1-flash",
      nodeTitle: "生命周期评估",
      currentText: "LCA 用于评估产品全生命周期的环境影响。",
    });

    expect(result.data.text).toBe("更容易理解的解释。");
    expect(result.model).toBe("deepseek-v4.1-flash");
    expect(result.usage).toMatchObject({ inputTokens: 120, outputTokens: 30, cachedInputTokens: 20, currency: "CNY" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries once when the first JSON payload does not satisfy the River schema", async () => {
    vi.stubEnv("DEEPSEEK_BASE_URL", "https://mock.deepseek.test");
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call += 1;
      const content = call === 1 ? JSON.stringify({ invalid: true }) : JSON.stringify({ text: "第二次返回的有效内容。" });
      return jsonResponse({
        id: `chatcmpl-${call}`,
        object: "chat.completion",
        created: call,
        model: "deepseek-v4.1-flash",
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }],
        usage: { prompt_tokens: 10, completion_tokens: 6, total_tokens: 16 },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await simplifyBlock({
      provider: "deepseek",
      apiKey: "sk-test-deepseek",
      model: "deepseek-v4.1-flash",
      nodeTitle: "保证金",
      currentText: "保证金不是手续费。",
    });

    expect(result.data.text).toBe("第二次返回的有效内容。");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("validates a DeepSeek key against the model list endpoint", async () => {
    vi.stubEnv("DEEPSEEK_BASE_URL", "https://mock.deepseek.test");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("https://mock.deepseek.test/models");
      return jsonResponse({
        object: "list",
        data: [{ id: "deepseek-v4.1-flash", object: "model", created: 1, owned_by: "kakouai" }],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(validateApiKey("deepseek", "sk-test-deepseek", "deepseek-v4.1-flash")).resolves.toEqual({
      ok: true,
      model: "deepseek-v4.1-flash",
    });
  });
});

describe("OpenCode Go provider adapter", () => {
  it("uses the OpenCode Go endpoint, session header and JSON object mode", async () => {
    vi.stubEnv("OPENCODE_GO_BASE_URL", "https://mock.opencode.test/v1");
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://mock.opencode.test/v1/chat/completions");
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer sk-test-opencode");
      expect(headers.get("x-opencode-session")).toBe("river-test-session");
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("deepseek-v4.1-flash");
      expect(body.response_format).toEqual({ type: "json_object" });
      expect(body.thinking).toBeUndefined();
      return jsonResponse({
        id: "chatcmpl-opencode-test",
        object: "chat.completion",
        created: 1,
        model: "deepseek-v4.1-flash",
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify({ text: "OpenCode Go 返回内容。" }) } }],
        usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await simplifyBlock({
      provider: "opencode-go",
      apiKey: "sk-test-opencode",
      model: "deepseek-v4.1-flash",
      sessionId: "river-test-session",
      nodeTitle: "生命周期评估",
      currentText: "测试内容",
    });

    expect(result.data.text).toBe("OpenCode Go 返回内容。");
    expect(result.usage).toMatchObject({ inputTokens: 50, outputTokens: 20, estimatedCost: 0, currency: "USD" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("usage accounting", () => {
  it("keeps DeepSeek pricing in CNY and accounts for cached input", () => {
    const usage = summarizeUsage("deepseek", {
      prompt_tokens: 1_000_000,
      completion_tokens: 500_000,
      prompt_cache_hit_tokens: 250_000,
    });

    expect(usage.currency).toBe("CNY");
    expect(usage.inputTokens).toBe(1_000_000);
    expect(usage.outputTokens).toBe(500_000);
    expect(usage.cachedInputTokens).toBe(250_000);
    expect(usage.estimatedCost).toBeGreaterThan(0);
    expect(DEEPSEEK_PRICING.currency).toBe("CNY");
  });
});
