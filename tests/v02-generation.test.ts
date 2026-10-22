import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { generateCompleteLearningPackage, splitSourceBatches } from "../server/ai";
import { fullLearningPackageSchema } from "../server/schemas";

describe("River v0.2 complete generation planning", () => {
  it("splits long ordered source text without dropping page boundaries", () => {
    const source = Array.from({ length: 8 }, (_, index) => `[第 ${index + 1} 页]\n${"内容".repeat(80)}`).join("\n\n");
    const batches = splitSourceBatches(source, 420);
    expect(batches.length).toBeGreaterThan(1);
    expect(batches.join("\n")).toContain("[第 1 页]");
    expect(batches.join("\n")).toContain("[第 8 页]");
  });

  it("accepts a complete tree plus both learning maps in one package schema", () => {
    const block = { type: "explanation", text: "解释", sourceRefs: [] };
    const node = { title: "主题", nodeType: "chapter", sourceRefs: [], blocks: [block], children: [] };
    const parsed = fullLearningPackageSchema.parse({
      introduction: {
        mapSections: [{ title: "章节", role: "intro", summary: "说明" }],
        goals: ["理解主题"],
        goalQuestions: ["主题是什么？"],
        positioning: "定位",
        prerequisiteNotes: [],
      },
      tree: { title: "课程", summary: "摘要", nodes: [node] },
      requirements: { title: "要求地图", nodes: [node] },
      questions: { title: "问题地图", nodes: [node] },
    });
    expect(parsed.tree.nodes).toHaveLength(1);
    expect(parsed.requirements.nodes).toHaveLength(1);
    expect(parsed.questions.nodes).toHaveLength(1);
  });

  it("runs one user operation across opening, tree and both map model calls", async () => {
    const originalBase = process.env.DEEPSEEK_BASE_URL;
    let calls = 0;
    const block = { type: "explanation", text: "解释", sourceRefs: [] };
    const node = { title: "主题", nodeType: "chapter", sourceRefs: [], blocks: [block], children: [] };
    const mock = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const system = String(body.messages?.[0]?.content || "");
      calls += 1;
      const payload = system.includes("学习开场设计器")
        ? { mapSections: [{ title: "章节", role: "intro", summary: "说明" }], goals: ["理解"], goalQuestions: ["是什么？"], positioning: "定位", prerequisiteNotes: [] }
        : system.includes("知识树生成器")
          ? { title: "课程", summary: "摘要", nodes: [node] }
          : system.includes("要求式学习地图")
            ? { title: "要求地图", nodes: [node] }
            : { title: "问题地图", nodes: [node] };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: `mock-${calls}`, object: "chat.completion", created: 1, model: "deepseek-v4.1-flash", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(payload) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
    });
    const server = await new Promise<Server>((resolve) => {
      const instance = mock.listen(0, "127.0.0.1", () => resolve(instance));
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No mock port");
    process.env.DEEPSEEK_BASE_URL = `http://127.0.0.1:${address.port}`;
    try {
      const progress: number[] = [];
      const result = await generateCompleteLearningPackage({
        provider: "deepseek",
        apiKey: "sk-test",
        model: "deepseek-v4.1-flash",
        sourceText: "[第 1 页]\n测试内容",
        profile: { intent: "rough", level: "zero", purpose: "systematic" },
        onProgress: (value) => progress.push(value),
      });
      expect(result.data.batchCount).toBe(1);
      expect(result.data.tree.nodes[0].title).toBe("主题");
      expect(result.data.requirements.nodes[0].title).toBe("主题");
      expect(result.data.questions.nodes[0].title).toBe("主题");
      expect(calls).toBe(4);
      expect(progress[0]).toBe(8);
      expect(progress.at(-1)).toBe(96);
      expect(progress.some((value) => value >= 24 && value <= 56)).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      if (originalBase === undefined) delete process.env.DEEPSEEK_BASE_URL;
      else process.env.DEEPSEEK_BASE_URL = originalBase;
    }
  });
});
