import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = "/Users/river/Documents/Codex/2026-08-24/hi/deliverables/RIVER_R6_20261019/raw";
function record(name: string, data: Record<string, unknown>) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, `${name}-${Date.now()}.json`), JSON.stringify(data, null, 2));
}
const title = () => `R6-mt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

async function readDb(page: any, wanted: string) {
  return page.evaluate(async (t: string) => {
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
    const n = notes.find((x) => x.title === t);
    const walk = (node: any, out: string[] = []) => {
      if (typeof node?.text === "string") out.push(node.text);
      (node?.content || []).forEach((c: any) => walk(c, out));
      return out;
    };
    return n ? walk(n.editorDoc).join("") : null;
  }, wanted);
}

test("R6-MULTI-02 second tab edit is silently overwritten by first tab", async ({ page, context }) => {
  const t = title();
  await page.goto("/");
  await page.getByRole("button", { name: "+ 新建笔记" }).click();
  await page.locator(".river-editor-layout .river-outline-editor").waitFor();
  const input = page.locator(".river-editor-toolbar input");
  await input.fill(t);
  await input.press("Tab");
  const first = page.locator('.river-editor-layout .river-outline-item[data-item-type="knowledge"] > .river-outline-content > p').first();
  await first.click();
  await page.keyboard.press("End");
  await page.keyboard.type("AAA");
  await page.waitForTimeout(800);
  const afterA = await readDb(page, t);

  const b = await context.newPage();
  await b.goto("/");
  await b.locator("article.tmi-note").filter({ hasText: t }).getByRole("button", { name: "打开" }).click();
  await b.locator(".river-editor-layout .river-outline-editor").waitFor();
  const bFirst = b.locator('.river-editor-layout .river-outline-item[data-item-type="knowledge"] > .river-outline-content > p').first();
  await bFirst.click();
  await b.keyboard.press("End");
  await b.keyboard.type("-BBB");
  await b.waitForTimeout(900);
  const afterB = await readDb(b, t);

  await first.click();
  await page.keyboard.press("End");
  await page.keyboard.type("-AAA2");
  await page.waitForTimeout(900);
  const afterA2 = await readDb(page, t);

  const dialogSeen = await b.evaluate(() => document.body.innerText.includes("冲突"));
  const final = await readDb(page, t);
  const bVisible = await b.locator(".river-editor-layout .river-outline-editor").innerText();
  record("multi-02", { title: t, afterA, afterB, afterA2, final, bEditLost: Boolean(afterB?.includes("-BBB") && !final?.includes("-BBB")), conflictUiSeen: dialogSeen, bVisibleHead: bVisible.slice(0, 160) });
  await b.close();
  expect(afterB).toContain("-BBB");
  expect(final).toContain("AAA");
});
