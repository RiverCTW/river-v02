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

const state = (page: Page) => page.evaluate(() => {
  const editor = (window as any).__riverEditor;
  const doc = editor.getJSON();
  const paraText = (item: any) =>
    (item.content || []).filter((c: any) => c.type === "paragraph").map((p: any) => (p.content || []).map((t: any) => t.text || "").join("")).join("|");
  const walk = (list: any): any[] => (list.content || []).map((item: any) => ({
    text: paraText(item),
    children: (item.content || []).filter((c: any) => c.type === "bulletList" || c.type === "orderedList").flatMap(walk),
  }));
  const tree = (doc.content || []).filter((n: any) => n.type === "bulletList" || n.type === "orderedList").flatMap(walk);
  const sel = editor.state.selection;
  const domSel = window.getSelection();
  return {
    tree,
    pmSelection: { from: sel.from, to: sel.to, empty: sel.empty },
    anchorText: (() => {
      const node = domSel?.anchorNode;
      const el = node?.nodeType === 3 ? node.parentElement : (node as HTMLElement | null);
      return el?.closest("p")?.textContent ?? null;
    })(),
    anchorOffset: domSel?.anchorOffset ?? null,
  };
});

test("R6-CARET-01 Enter after Tab keeps the caret in the new sibling", async ({ page }) => {
  const title = uniqueTitle("caret");
  await newNote(page, title);
  await page.keyboard.press("Enter");
  const s1 = await state(page);
  await page.keyboard.type("A");
  await page.keyboard.press("Tab");
  const s2 = await state(page);
  await page.keyboard.press("Enter");
  const s3 = await state(page);
  await page.keyboard.type("B");
  const s4 = await state(page);
  record("caret-01", { title, afterEnter: s1, afterA_Tab: s2, afterEnter2: s3, afterB: s4 });
  const flat = JSON.stringify(s4.tree);
  expect(flat, `tree=${flat}`).toContain('"text":"A"');
  expect(flat, `tree=${flat}`).toContain('"text":"B"');
});

test("R6-CARET-02 same sequence with a short pause before typing", async ({ page }) => {
  const title = uniqueTitle("caretpause");
  await newNote(page, title);
  await page.keyboard.press("Enter");
  await page.keyboard.type("A");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(250);
  const beforeTyping = await state(page);
  await page.keyboard.type("B");
  const after = await state(page);
  record("caret-02", { title, beforeTyping, after });
});

test("R6-CARET-03 third level: Enter after second Tab", async ({ page }) => {
  const title = uniqueTitle("caret3");
  await newNote(page, title);
  await page.keyboard.press("Enter");
  await page.keyboard.type("A");
  await page.keyboard.press("Enter");
  await page.keyboard.type("B");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await page.keyboard.type("C");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await page.keyboard.type("D");
  const final = await state(page);
  record("caret-03", { title, final });
});
