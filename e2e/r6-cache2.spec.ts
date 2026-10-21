import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = "/Users/river/Documents/Codex/2026-08-24/hi/deliverables/RIVER_R6_20261019/raw";
function record(name: string, data: Record<string, unknown>) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, `${name}-${Date.now()}.json`), JSON.stringify(data, null, 2));
}
const titleOf = (l: string) => `R6-${l}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const firstP = (page: Page) => page.locator('.river-editor-layout .river-outline-item[data-item-type="knowledge"] > .river-outline-content > p').first();

async function create(page: Page, text: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "+ 新建笔记" }).click();
  await page.locator(".river-editor-layout .river-outline-editor").waitFor();
  const t = titleOf("cache");
  const input = page.locator(".river-editor-toolbar input");
  await input.fill(t);
  await input.press("Tab");
  await firstP(page).click();
  await page.keyboard.press("End");
  await page.keyboard.type(text, { delay: 8 });
  return t;
}

async function note(page: Page, wanted: string) {
  return page.evaluate(async (t: string) => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open("river-v0.1");
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    const all: any[] = await new Promise((res, rej) => {
      const r = db.transaction("notes").objectStore("notes").getAll();
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    db.close();
    return all.find((n) => n.title === t) ?? null;
  }, wanted);
}

const flat = (doc: any) => {
  const out: string[] = [];
  const walk = (n: any) => { if (typeof n?.text === "string") out.push(n.text); (n?.content || []).forEach(walk); };
  walk(doc); return out.join("");
};

async function reopen(page: Page, t: string) {
  await page.goto("/");
  await page.locator("article.tmi-note").filter({ hasText: t }).getByRole("button", { name: "打开" }).click();
  await page.locator(".river-editor-layout .river-outline-editor").waitFor();
}

test("R6-CACHE-01 newer cache is recovered", async ({ page }) => {
  const t = await create(page, "DBOLD");
  await expect.poll(async () => flat((await note(page, t))?.editorDoc), { timeout: 10000 }).toContain("DBOLD");
  const n = await note(page, t);
  const newer = JSON.parse(JSON.stringify(n.editorDoc));
  const walk = (node: any) => { if (typeof node?.text === "string") node.text = node.text.split("DBOLD").join("CACHENEW"); (node?.content || []).forEach(walk); };
  walk(newer);
  await page.evaluate(({ id, doc }) => localStorage.setItem(`river.editor-snapshot.v1.${id}`, JSON.stringify({ editorDoc: doc, savedAt: Date.now() + 60000 })), { id: n.id, doc: newer });
  await reopen(page, t);
  const live = await page.evaluate(() => (window as any).__riverEditor.getText());
  const db = flat((await note(page, t))?.editorDoc);
  const pass = live.includes("CACHENEW") && db.includes("CACHENEW");
  record("cache-01", { title: t, live: live.slice(0, 120), db: db.slice(0, 120), pass });
  expect(pass).toBe(true);
});

test("R6-CACHE-03 identical cache causes no rewrite", async ({ page }) => {
  const t = await create(page, "SAME");
  await expect.poll(async () => flat((await note(page, t))?.editorDoc), { timeout: 10000 }).toContain("SAME");
  const n = await note(page, t);
  await page.evaluate(({ id, doc }) => localStorage.setItem(`river.editor-snapshot.v1.${id}`, JSON.stringify({ editorDoc: doc, savedAt: 1 })), { id: n.id, doc: n.editorDoc });
  const before = (await note(page, t)).updatedAt;
  await reopen(page, t);
  await page.waitForTimeout(500);
  const after = (await note(page, t)).updatedAt;
  const pass = before === after;
  record("cache-03", { title: t, updatedAtBefore: before, updatedAtAfter: after, pass });
  expect(pass).toBe(true);
});

test("R6-CACHE-06 cache of note A does not leak into note B", async ({ page }) => {
  const a = await create(page, "AAAONLY");
  await expect.poll(async () => flat((await note(page, a))?.editorDoc), { timeout: 10000 }).toContain("AAAONLY");
  await page.getByRole("button", { name: "返回笔记库" }).click();
  const b = await create(page, "BBBONLY");
  await expect.poll(async () => flat((await note(page, b))?.editorDoc), { timeout: 10000 }).toContain("BBBONLY");
  const na = await note(page, a);
  await page.evaluate(({ id, doc }) => localStorage.setItem(`river.editor-snapshot.v1.${id}`, JSON.stringify({ editorDoc: doc, savedAt: 1 })), { id: na.id, doc: na.editorDoc });
  await reopen(page, b);
  const live = await page.evaluate(() => (window as any).__riverEditor.getText());
  const pass = live.includes("BBBONLY") && !live.includes("AAAONLY");
  record("cache-06", { titleA: a, titleB: b, live: live.slice(0, 160), pass });
  expect(pass).toBe(true);
});
