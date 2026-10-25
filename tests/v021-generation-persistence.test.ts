import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../server/index";

const servers: Server[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  delete process.env.RIVER_DB_PATH;
  delete process.env.RIVER_ADMIN_USERNAME;
  delete process.env.RIVER_ADMIN_PASSWORD;
  delete process.env.DEEPSEEK_BASE_URL;
  tempDirs.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }));
});

async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  return `http://127.0.0.1:${address.port}`;
}

describe("River v0.21 durable full-package jobs", () => {
  it("keeps generating after the request returns and commits the result to the original note", async () => {
    const block = { type: "explanation", text: "解释", sourceRefs: [] };
    const node = { title: "主题", nodeType: "chapter", sourceRefs: [], blocks: [block], children: [] };
    let modelCalls = 0;
    const modelServer = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const requestBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const system = String(requestBody.messages?.[0]?.content || "");
      modelCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 30));
      const payload = system.includes("学习开场设计器")
        ? { mapSections: [{ title: "章节", role: "intro", summary: "说明" }], goals: ["理解"], goalQuestions: ["是什么？"], positioning: "定位", prerequisiteNotes: [] }
        : system.includes("知识树生成器")
          ? { title: "持久化知识树", summary: "摘要", nodes: [node] }
          : system.includes("要求式学习地图")
            ? { title: "要求地图", nodes: [node] }
            : { title: "问题地图", nodes: [node] };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: `mock-${modelCalls}`, object: "chat.completion", created: 1, model: "deepseek-v4.1-flash", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(payload) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
    });
    const modelBase = await listen(modelServer);
    process.env.DEEPSEEK_BASE_URL = modelBase;

    const directory = mkdtempSync(path.join(tmpdir(), "river-v021-generation-"));
    tempDirs.push(directory);
    process.env.RIVER_DB_PATH = path.join(directory, "river.sqlite");
    process.env.RIVER_ADMIN_USERNAME = "admin-test";
    process.env.RIVER_ADMIN_PASSWORD = "admin-secret";
    const appBase = await listen(createApp().listen(0, "127.0.0.1"));

    const login = await fetch(`${appBase}/api/auth/login`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "admin-test", password: "admin-secret" }),
    });
    const token = String((await login.json()).sessionToken);
    const auth = { authorization: `Bearer ${token}`, "content-type": "application/json" };
    const workspace = {
      format: "river-backup", version: 2, folders: [], notes: [{ id: "note-a", title: "原始笔记", uiStyle: "effie", generationState: "generating", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }],
      sources: [{ id: "source-a", noteId: "note-a", fileName: "LCA.pdf", mimeType: "application/pdf", fileSize: 1, kind: "pdf", pages: [{ pageNumber: 1, text: "测试", charCount: 2 }], slides: [], parseStatus: "parsed", textCharCount: 2, createdAt: "2026-01-01T00:00:00.000Z" }],
      profiles: [{ noteId: "note-a", intent: "rough", level: "zero", purpose: "systematic", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }],
      introductions: [], nodes: [], blocks: [], settings: [], learningMaps: [], chatMessages: [],
    };
    const put = await fetch(`${appBase}/api/workspace`, { method: "PUT", headers: auth, body: JSON.stringify({ expectedRevision: 0, payload: workspace }) });
    expect(put.status).toBe(200);

    const startBody = {
      noteId: "note-a", model: "deepseek-v4.1-flash", sourceText: "=== 资料 1：LCA.pdf ===\n[第 1 页]\n测试",
      profile: workspace.profiles[0], customization: "保留英文术语", totalPages: 1,
    };
    const start = await fetch(`${appBase}/api/ai/full-package`, {
      method: "POST", headers: { ...auth, "x-ai-provider": "deepseek", "x-ai-api-key": "sk-test" },
      body: JSON.stringify(startBody),
    });
    expect(start.status).toBe(202);
    const first = await start.json();
    expect(first.status).toBe("QUEUED");

    const duplicate = await fetch(`${appBase}/api/ai/full-package`, {
      method: "POST", headers: { ...auth, "x-ai-provider": "deepseek", "x-ai-api-key": "sk-test" },
      body: JSON.stringify(startBody),
    });
    expect(duplicate.status).toBe(202);
    expect((await duplicate.json()).jobId).toBe(first.jobId);

    let job: any = null;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const response = await fetch(`${appBase}/api/ai/full-package/${first.jobId}`, { headers: auth });
      job = await response.json();
      if (job.status === "COMPLETED" || job.status === "FAILED") break;
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    expect(job?.status).toBe("COMPLETED");
    expect(JSON.stringify(job)).not.toContain("sk-test");
    expect(modelCalls).toBe(4);

    const savedResponse = await fetch(`${appBase}/api/workspace`, { headers: auth });
    const saved = (await savedResponse.json()).payload;
    expect(saved.notes.find((note: any) => note.id === "note-a").generationState).toBe("completed");
    expect(saved.notes.find((note: any) => note.id === "note-a").profileLockedAt).toBeTruthy();
    expect(saved.nodes.length).toBeGreaterThan(0);
    expect(saved.learningMaps.map((map: any) => map.kind).sort()).toEqual(["questions", "requirements"]);
  });
});
