import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = "/Users/river/Documents/Codex/2026-08-24/hi/deliverables/RIVER_R6_20261019/raw";
function record(name: string, data: Record<string, unknown>) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, `${name}-${Date.now()}.json`), JSON.stringify(data, null, 2));
}
function uniqueTitle(label: string) {
  return `R6-${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
const editorRoot = (page: Page) => page.locator(".river-editor-layout .river-outline-editor");
const firstParagraph = (page: Page) =>
  page.locator('.river-editor-layout .river-outline-item[data-item-type="knowledge"] > .river-outline-content > p').first();

async function newNote(page: Page, title: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "+ 新建笔记" }).click();
  await editorRoot(page).waitFor();
  const input = page.locator(".river-editor-toolbar input");
  await input.fill(title);
  await input.press("Tab");
  await firstParagraph(page).click();
  await page.keyboard.press("End");
}

const shapeFn = () => {
  const doc = (window as any).__riverEditor.getJSON();
  const paraText = (item: any) =>
    (item.content || []).filter((c: any) => c.type === "paragraph" || c.type === "heading")
      .map((p: any) => (p.content || []).map((t: any) => t.text || "").join("")).join(" ");
  const walkList = (list: any): any[] =>
    (list.content || []).map((item: any) => ({
      text: paraText(item),
      children: (item.content || []).filter((c: any) => c.type === "bulletList" || c.type === "orderedList").flatMap(walkList),
    }));
  return (doc.content || []).filter((n: any) => n.type === "bulletList" || n.type === "orderedList").flatMap(walkList);
};
const tree = (page: Page) => page.evaluate(shapeFn);

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

test("R6-STRUCT-01 three-level nesting through repeated Tab", async ({ page }) => {
  const title = uniqueTitle("struct");
  await newNote(page, title);
  await page.keyboard.press("Enter");
  await page.keyboard.type("A");
  const steps: any[] = [];
  steps.push({ step: "A", tree: await tree(page) });
  await page.keyboard.press("Enter");
  await page.keyboard.type("B");
  await page.keyboard.press("Tab");
  steps.push({ step: "B+TAB", tree: await tree(page) });
  await page.keyboard.press("Enter");
  await page.keyboard.type("C");
  await page.keyboard.press("Tab");
  steps.push({ step: "C+TAB", tree: await tree(page) });

  const root = steps[2].tree?.find((item: any) => item.text === "A");
  const b = root?.children?.find((item: any) => item.text === "B");
  const c = b?.children?.[0];
  const pass = root?.text === "A" && b?.text === "B" && c?.text === "C";
  record("struct-01", { title, steps, pass });
  expect(pass, JSON.stringify(steps[2].tree)).toBe(true);
});

test("R6-STRUCT-02 Shift+Tab lifts only the current node", async ({ page }) => {
  const title = uniqueTitle("lift");
  await newNote(page, title);
  await page.keyboard.press("Enter");
  await page.keyboard.type("P");
  await page.keyboard.press("Enter");
  await page.keyboard.type("C1");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await page.keyboard.type("C2");
  const before = await tree(page);
  await page.keyboard.press("Shift+Tab");
  const after = await tree(page);
  const parentBefore = before.find((item: any) => item.text === "P");
  const parentAfter = after.find((item: any) => item.text === "P");
  const pass = Boolean(parentBefore?.children?.some((item: any) => item.text === "C1"))
    && Boolean(parentBefore?.children?.some((item: any) => item.text === "C2"))
    && Boolean(after.some((item: any) => item.text === "C2"))
    && !parentAfter?.children?.some((item: any) => item.text === "C2");
  record("struct-02", { title, before, after, pass });
  expect(pass).toBe(true);
});

test("R6-FOLD-01 collapsed state survives reload with subtree intact", async ({ page }) => {
  const title = uniqueTitle("fold");
  await newNote(page, title);
  await page.keyboard.type("PARENT");
  await page.keyboard.press("Enter");
  await page.keyboard.type("CHILD");
  await page.keyboard.press("Tab");
  const root = page.locator('.river-outline-item[data-item-type="knowledge"]').first();
  await root.locator("button.river-outline-toggle").first().click();
  await expect(root).toHaveAttribute("data-collapsed", "true");
  await page.waitForTimeout(400);
  await page.goto("/");
  const card = page.locator("article.tmi-note").filter({ hasText: title });
  await card.getByRole("button", { name: "打开" }).click();
  await editorRoot(page).waitFor();
  const collapsed = await page.locator('.river-outline-item[data-item-type="knowledge"]').first().getAttribute("data-collapsed");
  const after = await tree(page);
  const pass = collapsed === "true" && JSON.stringify(after).includes("CHILD");
  record("fold-01", { title, collapsed, tree: after, pass });
  expect(pass).toBe(true);
});

test("R6-MULTI-01 two tabs on the same note", async ({ page, context }) => {
  const title = uniqueTitle("multi");
  await newNote(page, title);
  await page.keyboard.type("TAB-A-1");
  await page.waitForTimeout(600);

  const second = await context.newPage();
  await second.goto("/");
  const card = second.locator("article.tmi-note").filter({ hasText: title });
  await card.getByRole("button", { name: "打开" }).click();
  await second.locator(".river-editor-layout .river-outline-editor").waitFor();
  const secondFirst = second.locator('.river-editor-layout .river-outline-item[data-item-type="knowledge"] > .river-outline-content > p').first();
  await secondFirst.click();
  await second.keyboard.press("End");
  await second.keyboard.type("-TAB-B");
  await second.waitForTimeout(800);

  await firstParagraph(page).click();
  await page.keyboard.press("End");
  await page.keyboard.type("-TAB-A-2");
  await page.waitForTimeout(800);

  await second.reload();
  await second.locator("article.tmi-note").filter({ hasText: title }).getByRole("button", { name: "打开" }).click();
  await second.locator(".river-editor-layout .river-outline-editor").waitFor();
  const textB = await second.locator(".river-editor-layout .river-outline-editor").innerText();
  await page.reload();
  await page.locator("article.tmi-note").filter({ hasText: title }).getByRole("button", { name: "打开" }).click();
  await page.locator(".river-editor-layout .river-outline-editor").waitFor();
  const textA = await page.locator(".river-editor-layout .river-outline-editor").innerText();
  const note = await findNote(page, title);
  const dbText = JSON.stringify(note?.editorDoc ?? {});
  const pass = dbText.includes("TAB-B") || dbText.includes("TAB-A-2");
  record("multi-01", { title, textA: textA.slice(0, 200), textB: textB.slice(0, 200), bothLost: !dbText.includes("TAB-B") && !dbText.includes("TAB-A-2"), pass });
  await second.close();
  expect(pass).toBe(true);
});

test("R6-CACHE-07 stale cache must not resurrect a deleted note", async ({ page }) => {
  const title = uniqueTitle("resurrect");
  await newNote(page, title);
  await page.keyboard.type("WILLDELETE");
  await page.waitForTimeout(600);
  const note = await findNote(page, title);
  await page.evaluate((id) => localStorage.setItem(`river.editor-snapshot.v1.${id}`, JSON.stringify({ editorDoc: { type: "doc", content: [{ type: "bulletList", content: [{ type: "listItem", attrs: { itemType: "knowledge", nodeId: "revived", nodeType: "root", headingLevel: 1, listType: "bullet", sourceRefs: [], userModified: false, collapsed: false, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }, content: [{ type: "paragraph", content: [{ type: "text", text: "REVIVED" }] }] }] }] }, savedAt: 1 })), note.id);

  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/");
  const card = page.locator("article.tmi-note").filter({ hasText: title });
  await expect(card).toHaveCount(1);
  await card.getByRole("button", { name: "删除" }).click();
  await expect.poll(async () => Boolean((await findNote(page, title))?.deletedAt), { timeout: 10000 }).toBe(true);
  await page.goto("/");
  const cards = await page.locator("article.tmi-note").filter({ hasText: title }).count();
  const alive = await findNote(page, title);
  const pass = cards === 0 && Boolean(alive?.deletedAt);
  record("cache-07", { title, noteId: note?.id, cardsAfterReload: cards, noteInDb: Boolean(alive), softDeleted: Boolean(alive?.deletedAt), pass });
  expect(pass).toBe(true);
});

test("R6-UNDO-02 rapid undo burst keeps one coherent document", async ({ page }) => {
  const title = uniqueTitle("burst");
  await newNote(page, title);
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.type(`burst${i} `, { delay: 3 });
    if (i !== 11) await page.keyboard.press("Enter");
  }
  const before = await tree(page);
  for (let i = 0; i < 20; i += 1) await page.keyboard.press("Meta+z");
  const undone = await tree(page);
  for (let i = 0; i < 20; i += 1) await page.keyboard.press("Meta+Shift+z");
  const redone = await tree(page);
  await page.waitForTimeout(500);
  const note = await findNote(page, title);
  const persisted = JSON.stringify(note?.editorDoc ?? {});
  const pass = redone.length === before.length && persisted.includes("burst11");
  record("undo-02", { title, beforeCount: before.length, undoneCount: undone.length, redoneCount: redone.length, persistedHasLast: persisted.includes("burst11"), pass });
  expect(pass).toBe(true);
});
