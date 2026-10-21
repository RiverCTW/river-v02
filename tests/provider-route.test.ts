import { createServer, type Server } from "node:http";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../server/index";

const servers: Server[] = [];
const originalHome = process.env.HOME;

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("测试服务器没有可用端口。");
      resolve(address.port);
    });
  });
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  delete process.env.DEEPSEEK_BASE_URL;
  delete process.env.OPENCODE_GO_BASE_URL;
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
});

describe("OpenCode Go cc-switch route", () => {
  it("reads the local cc-switch key on the server and never returns it to the browser", async () => {
    const tempHome = mkdtempSync(path.join(tmpdir(), "river-cc-switch-"));
    const configDirectory = path.join(tempHome, ".cc-switch");
    mkdirSync(configDirectory, { recursive: true });
    const database = new DatabaseSync(path.join(configDirectory, "cc-switch.db"));
    database.exec(`
      create table providers (
        id text not null,
        app_type text not null,
        name text not null,
        settings_config text not null,
        created_at integer,
        is_current boolean not null default 0,
        primary key (id, app_type)
      )
    `);
    database.prepare("insert into providers (id, app_type, name, settings_config, created_at, is_current) values (?, ?, ?, ?, ?, ?)").run(
      "opencode-go-test",
      "codex",
      "OpenCode Go",
      JSON.stringify({ auth: { OPENAI_API_KEY: "sk-local-cc-switch-secret" } }),
      Date.now(),
      1,
    );
    database.close();
    process.env.HOME = tempHome;

    let receivedAuthorization = "";
    let receivedSession = "";
    const mockOpenCodeGo = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      receivedAuthorization = String(req.headers.authorization || "");
      receivedSession = String(req.headers["x-opencode-session"] || "");
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        id: "chatcmpl-opencode-route",
        object: "chat.completion",
        created: 1,
        model: "deepseek-v4.1-flash",
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify({ text: "本机 cc-switch 链路成功。" }) } }],
        usage: { prompt_tokens: 9, completion_tokens: 4, total_tokens: 13 },
      }));
    });
    servers.push(mockOpenCodeGo);
    const mockPort = await listen(mockOpenCodeGo);
    process.env.OPENCODE_GO_BASE_URL = `http://127.0.0.1:${mockPort}`;

    const api = createApp();
    const apiServer = api.listen(0, "127.0.0.1");
    servers.push(apiServer);
    await new Promise<void>((resolve) => apiServer.once("listening", resolve));
    const apiAddress = apiServer.address();
    if (!apiAddress || typeof apiAddress === "string") throw new Error("River 测试服务器没有可用端口。");

    const response = await fetch(`http://127.0.0.1:${apiAddress.port}/api/ai/simplify`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ai-provider": "opencode-go",
        "x-ai-auth-source": "cc-switch",
        "x-opencode-session": "river-route-session",
      },
      body: JSON.stringify({
        model: "deepseek-v4.1-flash",
        nodeTitle: "生命周期评估",
        currentText: "这是一个测试定义。",
      }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ data: { text: "本机 cc-switch 链路成功。" }, model: "deepseek-v4.1-flash" });
    expect(JSON.stringify(payload)).not.toContain("sk-local-cc-switch-secret");
    expect(receivedAuthorization).toBe("Bearer sk-local-cc-switch-secret");
    expect(receivedSession).toBe("river-route-session");
    rmSync(tempHome, { recursive: true, force: true });
  });

  it("blocks cc-switch authentication when Cloudflare forwarding headers are present", async () => {
    const api = createApp();
    const apiServer = api.listen(0, "127.0.0.1");
    servers.push(apiServer);
    await new Promise<void>((resolve) => apiServer.once("listening", resolve));
    const apiAddress = apiServer.address();
    if (!apiAddress || typeof apiAddress === "string") throw new Error("River 测试服务器没有可用端口。");

    const response = await fetch(`http://127.0.0.1:${apiAddress.port}/api/ai/validate-key`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ai-provider": "opencode-go",
        "x-ai-auth-source": "cc-switch",
        "cf-ray": "test-public-request",
      },
      body: JSON.stringify({ model: "deepseek-v4.1-flash" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.message).toBe("缺少 API Key。");
  });
});

describe("DeepSeek API route", () => {
  it("passes the selected provider and key to the DeepSeek adapter and returns River data", async () => {
    let receivedAuthorization = "";
    let receivedModel = "";
    const mockDeepSeek = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      receivedAuthorization = String(req.headers.authorization || "");
      receivedModel = body.model;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        id: "chatcmpl-route-test",
        object: "chat.completion",
        created: 1,
        model: "deepseek-v4.1-flash",
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify({ text: "路由链路成功。" }) } }],
        usage: { prompt_tokens: 8, completion_tokens: 3, total_tokens: 11 },
      }));
    });
    servers.push(mockDeepSeek);
    const mockPort = await listen(mockDeepSeek);
    process.env.DEEPSEEK_BASE_URL = `http://127.0.0.1:${mockPort}`;

    const api = createApp();
    const apiServer = api.listen(0, "127.0.0.1");
    servers.push(apiServer);
    await new Promise<void>((resolve) => apiServer.once("listening", resolve));
    const apiAddress = apiServer.address();
    if (!apiAddress || typeof apiAddress === "string") throw new Error("River 测试服务器没有可用端口。");

    const response = await fetch(`http://127.0.0.1:${apiAddress.port}/api/ai/simplify`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ai-provider": "deepseek",
        "x-ai-api-key": "sk-test-deepseek",
      },
      body: JSON.stringify({
        model: "deepseek-v4.1-flash",
        nodeTitle: "生命周期评估",
        currentText: "这是一个测试定义。",
      }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ data: { text: "路由链路成功。" }, model: "deepseek-v4.1-flash" });
    expect(receivedAuthorization).toBe("Bearer sk-test-deepseek");
    expect(receivedModel).toBe("deepseek-v4.1-flash");
  });
});
