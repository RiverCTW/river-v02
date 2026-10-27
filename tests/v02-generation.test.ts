import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { generateCompleteLearningPackage, splitSourceBatches } from "../server/ai";
import { fullLearningPackageSchema, openingSchema } from "../server/schemas";

const block = { type: "explanation", text: "解释", sourceRefs: [] };
const node = { title: "主题", nodeType: "chapter", sectionId: "s1", sourceRefs: [], blocks: [block], children: [] };

function payloadFor(system: string) {
  if (system.includes("课件结构分析器")) {
    return {
      chapterTitle: "测试章节",
      sections: [{ id: "s1", title: "小节一", role: "key", startPage: 1, endPage: 1, summary: "说明", keyPoints: ["要点"], examples: [] }],
      learningOutcomes: [], exercises: [], hasEnglishTerms: false,
    };
  }
  if (system.includes("知识树正文生成器")) {
    return { title: "课程", summary: "摘要", nodes: [node], coveredSectionIds: ["s1"] };
  }
  if (system.includes("章节导入设计器")) {
    return {
      positioning: "这一章为后续判断打基础。",
      learningPath: [{ title: "第一步", detail: "先建立整体框架。" }, { title: "第二步", detail: "再深入细节。" }],
      prerequisites: ["具备基本阅读理解即可。"],
      clusters: [{ id: "c1", title: "小节一" }],
    };
  }
  if (system.includes("本章目录生成器")) {
    return { entries: [{ sectionId: "s1", title: "小节一", role: "key", startPage: 1, endPage: 1, blocks: [block, { type: "example", text: "例子", sourceRefs: [] }], subsections: [] }] };
  }
  if (system.includes("学习目标生成器")) {
    return {
      chapterGoal: { clusterId: null, text: "给定情境能完成判断。", reason: "综合任务", sourceRefs: [] },
      goals: [{ clusterId: "c1", text: "能解释小节一。", reason: "课件重点", sourceRefs: [] }],
    };
  }
  if (system.includes("导入问题生成器")) {
    return {
      chapterQuestion: { clusterId: null, text: "整章要解决什么？", referenceAnswer: "综合答案" },
      questions: [{ clusterId: "c1", text: "小节一解决什么？", referenceAnswer: "小节答案" }],
    };
  }
  return {};
}

describe("River v0.22 complete generation planning", () => {
  it("splits long ordered source text without dropping page boundaries", () => {
    const source = Array.from({ length: 8 }, (_, index) => `[第 ${index + 1} 页]\n${"内容".repeat(80)}`).join("\n\n");
    const batches = splitSourceBatches(source, 420);
    expect(batches.length).toBeGreaterThan(1);
    expect(batches.join("\n")).toContain("[第 1 页]");
    expect(batches.join("\n")).toContain("[第 8 页]");
  });

  it("keeps the legacy package schema readable for old notes", () => {
    const legacyNode = { title: "主题", nodeType: "chapter", sourceRefs: [], blocks: [block], children: [] };
    const parsed = fullLearningPackageSchema.parse({
      introduction: {
        mapSections: [{ title: "章节", role: "intro", summary: "说明" }],
        goals: ["理解主题"], goalQuestions: ["主题是什么？"], positioning: "定位", prerequisiteNotes: [],
      },
      tree: { title: "课程", summary: "摘要", nodes: [legacyNode] },
      requirements: { title: "要求地图", nodes: [legacyNode] },
      questions: { title: "问题地图", nodes: [legacyNode] },
    });
    expect(parsed.tree.nodes).toHaveLength(1);
    expect(parsed.requirements.nodes).toHaveLength(1);
  });

  it("validates the v0.22 opening shape", () => {
    expect(openingSchema.parse({
      positioning: "定位",
      learningPath: [{ title: "第一步", detail: "细节" }, { title: "第二步", detail: "细节" }],
      prerequisites: ["提示"],
      clusters: [{ id: "c1", title: "簇" }],
    }).clusters[0].title).toBe("簇");
  });

  it("runs the staged pipeline: chapter map, body, opening, directory, goals, questions", async () => {
    const originalBase = process.env.DEEPSEEK_BASE_URL;
    let calls = 0;
    const mock = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const system = String(body.messages?.[0]?.content || "");
      calls += 1;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: `mock-${calls}`, object: "chat.completion", created: 1, model: "deepseek-v4.1-flash", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(payloadFor(system)) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
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
      expect(result.data.tree.nodes[0].sectionId).toBe("s1");
      expect(result.data.introduction.clusters[0].title).toBe("小节一");
      expect(result.data.introduction.goalItems[0].clusterId).toBe("c1");
      expect(result.data.introduction.questionItems[0].referenceAnswer).toBe("小节答案");
      expect(calls).toBe(6);
      expect(progress[0]).toBe(6);
      expect(progress.at(-1)).toBe(96);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      if (originalBase === undefined) delete process.env.DEEPSEEK_BASE_URL;
      else process.env.DEEPSEEK_BASE_URL = originalBase;
    }
  });
});
