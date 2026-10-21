import { test, type Page } from "@playwright/test";
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
  await page.keyboard.press("Enter");
}

const caret = (page: Page) => page.evaluate(() => {
  const editor = (window as any).__riverEditor;
  const sel = editor.state.selection;
  const dom = window.getSelection();
  const node = dom?.anchorNode;
  const el = node?.nodeType === 3 ? node.parentElement : (node as HTMLElement | null);
  return { from: sel.from, to: sel.to, anchorText: el?.closest("p")?.textContent ?? null, anchorOffset: dom?.anchorOffset ?? null };
});

test("R6-CARET-04 typing after Tab must append, not prepend", async ({ page }) => {
  const title = uniqueTitle("caret4");
  await newNote(page, title);
  await page.keyboard.type("HEAD");
  const beforeTab = await caret(page);
  await page.keyboard.press("Tab");
  const afterTab = await caret(page);
  await page.keyboard.type("TAIL");
  const text = await page.evaluate(() => (window as any).__riverEditor.getText());
  record("caret-04", { title, beforeTab, afterTab, editorText: text });
});

test("R6-CARET-05 Shift+Tab caret position", async ({ page }) => {
  const title = uniqueTitle("caret5");
  await newNote(page, title);
  await page.keyboard.type("HEAD");
  await page.keyboard.press("Tab");
  await page.keyboard.press("End");
  const beforeLift = await caret(page);
  await page.keyboard.press("Shift+Tab");
  const afterLift = await caret(page);
  await page.keyboard.type("TAIL");
  const text = await page.evaluate(() => (window as any).__riverEditor.getText());
  record("caret-05", { title, beforeLift, afterLift, editorText: text });
});
