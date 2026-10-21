import { test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

test.use({ video: { mode: "on", size: { width: 1280, height: 720 } }, viewport: { width: 1280, height: 800 }, launchOptions: { slowMo: 0 }, trace: "off" });

const LOG = "/Users/river/Documents/Codex/2026-08-24/hi/deliverables/RIVER_R6_20261019/raw/master-timeline.json";

async function mark(label: string, marks: { label: string; t: number }[], started: number) {
  marks.push({ label, t: Date.now() - started });
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  fs.writeFileSync(LOG, JSON.stringify(marks, null, 2));
}

const pause = (page: Page) => page.waitForTimeout(650);

async function editorText(page: Page) {
  return page.evaluate(() => (window as any).__riverEditor?.getText?.() ?? "");
}

async function findNote(page: Page, title: string) {
  return page.evaluate(async (wanted) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const request = indexedDB.open("river-v0.1");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const notes: any[] = await new Promise((resolve, reject) => {
      const request = db.transaction("notes").objectStore("notes").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return notes.find((note) => note.title === wanted) ?? null;
  }, title);
}

test("R6 master recording", async ({ page, context }) => {
  test.setTimeout(400_000);
  const marks: { label: string; t: number }[] = [];
  const started = Date.now();
  const title = `R6录像-${new Date().toISOString().slice(11, 19)}`;

  await mark("A1 新建笔记", marks, started);
  await page.goto("/");
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "+ 新建笔记" }).click();
  await page.locator(".river-editor-layout .river-outline-editor").waitFor();
  const titleInput = page.locator(".river-editor-toolbar input");
  await titleInput.fill(title);
  await titleInput.press("Tab");
  const first = page.locator('.river-editor-layout .river-outline-item[data-item-type="knowledge"] > .river-outline-content > p').first();
  await first.click();
  await page.keyboard.press("End");
  await pause(page);

  await mark("A2 逐键输入标题", marks, started);
  await page.keyboard.type("生命周期评估 LCA", { delay: 140 });
  await page.keyboard.press("Enter");
  await pause(page);
  await page.keyboard.type("LCA 评估产品整个生命周期对环境的影响。", { delay: 75 });
  await pause(page);

  await mark("A3 Tab 缩进后光标位置", marks, started);
  await page.keyboard.press("Enter");
  await page.keyboard.type("HEAD", { delay: 140 });
  await pause(page);
  await page.keyboard.press("Tab");
  await page.waitForTimeout(500);
  await page.keyboard.type("TAIL", { delay: 140 });
  await page.waitForTimeout(1200);

  await mark("B1 语义标记", marks, started);
  await page.keyboard.press("Enter");
  await pause(page);
  await page.keyboard.type("**粉色重点** *金色斜体* ::黄色标注:: ++评论++ ~~删除~~ `代码`", { delay: 60 });
  await page.waitForTimeout(1200);

  await mark("B2 标记内部编辑", marks, started);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.type("改", { delay: 200 });
  await pause(page);

  await mark("C1 多层级结构", marks, started);
  await page.keyboard.press("Enter");
  await page.keyboard.type("A 根节点", { delay: 110 });
  await page.keyboard.press("Enter");
  await page.keyboard.type("A1 子节点", { delay: 110 });
  await page.keyboard.press("Tab");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("A2 子节点", { delay: 110 });
  await pause(page);

  await mark("C2 折叠与展开", marks, started);
  const root = page.locator('.river-outline-item[data-item-type="knowledge"]').filter({ hasText: "A 根节点" }).first();
  const toggle = root.locator("button.river-outline-toggle").first();
  await toggle.click();
  await page.waitForTimeout(900);
  await toggle.click();
  await pause(page);

  await mark("D1 多行粘贴", marks, started);
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:5183" });
  const paste = "第一行：获取阶段\n第二行：制造阶段\n第三行：使用阶段\n第四行：处置阶段";
  await page.evaluate((text) => navigator.clipboard.writeText(text), paste);
  await page.keyboard.press("Meta+v");
  await page.waitForTimeout(1200);

  await mark("D2 返回笔记库再打开", marks, started);
  await page.getByRole("button", { name: "返回笔记库" }).click();
  await page.waitForTimeout(1000);
  const card = page.locator("article.tmi-note").filter({ hasText: title });
  await card.getByRole("button", { name: "打开" }).click();
  await page.locator(".river-editor-layout .river-outline-editor").waitFor();
  await page.waitForTimeout(1200);

  await mark("E1 旧缓存回滚演示（构造过期缓存）", marks, started);
  await page.waitForTimeout(600);
  const note = await findNote(page, title);
  const before = await editorText(page);
  await page.evaluate(({ id, doc }) => {
    const clone = JSON.parse(JSON.stringify(doc));
    const walk = (node: any) => {
      if (typeof node?.text === "string") node.text = node.text.split("LCA 评估产品").join("STALE-OLD");
      (node?.content || []).forEach(walk);
    };
    walk(clone);
    localStorage.setItem(`river.editor-snapshot.v1.${id}`, JSON.stringify({ editorDoc: clone, savedAt: 1 }));
  }, { id: note.id, doc: note.editorDoc });
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "返回笔记库" }).click();
  await page.waitForTimeout(900);
  await card.getByRole("button", { name: "打开" }).click();
  await page.locator(".river-editor-layout .river-outline-editor").waitFor();
  await page.waitForTimeout(1500);
  const after = await editorText(page);
  const reopened = await findNote(page, title);
  const persisted = JSON.stringify(reopened?.editorDoc ?? {});
  fs.writeFileSync(
    "/Users/river/Documents/Codex/2026-08-24/hi/deliverables/RIVER_R6_20261019/raw/master-rollback.json",
    JSON.stringify({ title, before: before.slice(0, 400), after: after.slice(0, 400), dbHasStale: persisted.includes("STALE-OLD"), dbHasOriginal: persisted.includes("LCA 评估产品") }, null, 2),
  );
  await page.waitForTimeout(1200);
  await mark("F1 结束", marks, started);
});
