import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

test.use({
  video: {
    mode: "on",
    size: { width: 1440, height: 900 },
  },
});

const evidenceRoot = path.resolve("research/river-editor-repair-final");
const frameDir = path.join(evidenceRoot, "keyframes");

const rootParagraph = (page: Page) =>
  page.locator('.river-editor-layout .river-outline-item[data-item-type="knowledge"]')
    .first().locator(":scope > .river-outline-content > p").first();

const topItems = (page: Page) =>
  page.locator(".river-editor-layout .river-outline-editor > ul > li.river-outline-item, .river-editor-layout .river-outline-editor > ol > li.river-outline-item");

const editorText = (page: Page) =>
  page.evaluate(() => {
    const editor = (window as any).__riverEditor;
    return editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n");
  });

const screenshot = async (page: Page, name: string) => {
  await page.screenshot({ path: path.join(frameDir, name) });
};

async function focusLastItem(page: Page): Promise<void> {
  const last = topItems(page).last().locator(":scope > .river-outline-content > p").last();
  await last.click();
  await page.keyboard.press("End");
}

async function newSibling(page: Page, text: string): Promise<void> {
  await focusLastItem(page);
  await page.keyboard.press("Enter");
  await page.keyboard.insertText(text);
}

test("RIVER editor repair master recording", async ({ page }) => {
  fs.mkdirSync(frameDir, { recursive: true });
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:5174",
  });

  const title = `RIVER-REPAIR-${Date.now().toString(36)}`;
  await page.goto("/");
  await page.getByRole("button", { name: "+ 新建笔记" }).click();
  await page.waitForSelector(".river-editor-layout .river-outline-editor");
  await page.locator(".river-editor-toolbar input").fill(title);
  await page.locator(".river-editor-toolbar input").press("Tab");
  await rootParagraph(page).click();
  await page.keyboard.press("End");
  await page.waitForTimeout(250);
  await screenshot(page, "01-start.png");

  // P0-1: seven-class representative multi-line paste.
  await page.keyboard.press("Enter");
  const pastedLines = ["第一行中文", "第二行中文", "", "第四行 emoji 🚀✨"];
  await page.evaluate(async (value) => navigator.clipboard.writeText(value), pastedLines.join("\n"));
  await page.keyboard.press("Meta+v");
  const pastedItem = topItems(page).last();
  await expect.poll(() => pastedItem.locator(":scope > .river-outline-content > p").allTextContents()).toEqual(pastedLines);
  await page.waitForTimeout(350);
  await screenshot(page, "02-multiline-paste.png");

  // P0-2: fast entry with unique IDs, then exact order check.
  await focusLastItem(page);
  await page.keyboard.press("Enter");
  const rapid = Array.from({ length: 60 }, (_, index) => `ITEM_${String(index + 1).padStart(3, "0")}`);
  for (let index = 0; index < rapid.length; index += 1) {
    await page.keyboard.insertText(rapid[index]);
    if (index < rapid.length - 1) await page.keyboard.press("Enter");
  }
  const rapidTexts = await topItems(page).locator(":scope > .river-outline-content > p").allTextContents();
  const rapidStart = rapidTexts.indexOf(rapid[0]);
  expect(rapidStart).toBeGreaterThanOrEqual(0);
  expect(rapidTexts.slice(rapidStart)).toEqual(rapid);
  await page.waitForTimeout(350);
  await screenshot(page, "03-rapid-60.png");

  // P0-3: select-all delete keeps a valid outline; undo restores everything.
  const beforeClear = await editorText(page);
  await page.keyboard.press("Meta+a");
  await page.keyboard.press("Backspace");
  await expect.poll(async () => page.evaluate(() => (window as any).__riverEditor.getJSON().content.map((node: any) => node.type))).toEqual(["bulletList"]);
  await expect.poll(async () => page.evaluate(() => (window as any).__riverEditor.getJSON().content[0].content.length)).toBe(1);
  await page.waitForTimeout(350);
  await screenshot(page, "04-selectall-cleared.png");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if ((await editorText(page)).includes("ITEM_060")) break;
    await page.keyboard.press("Meta+z");
  }
  await expect.poll(() => editorText(page)).toBe(beforeClear);
  await page.waitForTimeout(350);
  await screenshot(page, "05-selectall-undo.png");

  // P1-2: Enter with a text selection.
  await newSibling(page, "ALPHA BETA");
  await page.keyboard.press("Home");
  for (let index = 0; index < 5; index += 1) await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Enter");
  await expect.poll(async () => {
    const texts = await topItems(page).locator(":scope > .river-outline-content > p").allTextContents();
    return texts.slice(-2);
  }).toEqual(["", " BETA"]);
  await page.waitForTimeout(350);
  await screenshot(page, "06-selection-enter.png");

  // P1-3: slash menu filters and executes a local heading command.
  await newSibling(page, "/");
  await expect(page.locator(".river-slash-menu")).toBeVisible();
  await page.keyboard.type("h2");
  await expect(page.locator(".river-slash-menu")).toContainText("二级标题");
  await page.waitForTimeout(350);
  await screenshot(page, "07-slash-menu.png");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("SLASH_HEADING");
  const slashHeading = page.locator('.river-outline-item[data-heading="2"]').filter({ hasText: "SLASH_HEADING" });
  await expect(slashHeading).toHaveCount(1);

  // P1-4: local bullet and ordered-list rules.
  await focusLastItem(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type("- ");
  await page.keyboard.insertText("BULLET_A");
  await expect(page.locator(".river-editor-layout .river-outline-editor > ul > li.river-outline-item").filter({ hasText: "BULLET_A" })).toHaveCount(1);
  await page.keyboard.press("Enter");
  await page.keyboard.type("1. ");
  await page.keyboard.insertText("ORDERED_B");
  await expect(page.locator(".river-editor-layout .river-outline-editor > ol > li.river-outline-item").filter({ hasText: "ORDERED_B" })).toHaveCount(1);
  await page.waitForTimeout(350);
  await screenshot(page, "08-heading-list-rules.png");

  // P1-1: Tab / Shift+Tab preserve the parent and the subtree.
  await newSibling(page, "PARENT_TAB");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("CHILD_TAB");
  await page.keyboard.press("Tab");
  await expect(page.locator(".river-editor-layout .river-outline-editor li li.river-outline-item").filter({ hasText: "CHILD_TAB" })).toHaveCount(1);
  await page.waitForTimeout(350);
  await screenshot(page, "09-tab-indent.png");
  await page.keyboard.press("Shift+Tab");
  await expect(topItems(page).filter({ hasText: "PARENT_TAB" })).toHaveCount(1);
  await expect(topItems(page).filter({ hasText: "CHILD_TAB" })).toHaveCount(1);
  await page.waitForTimeout(350);
  await screenshot(page, "10-shift-tab-outdent.png");

  // Inline semantic marks.
  await newSibling(page, "**重点** ::标注:: ++评论++ ~~删除~~");
  const marksItem = topItems(page).filter({ hasText: "重点" }).last();
  await expect(marksItem.locator(".river-semantic-pink")).toHaveCount(1);
  await expect(marksItem.locator(".river-semantic-annotation")).toHaveCount(1);
  await expect(marksItem.locator(".river-semantic-comment")).toHaveCount(1);
  await page.waitForTimeout(350);
  await screenshot(page, "11-inline-marks.png");

  // Folding keeps descendants and their persisted structure.
  await focusLastItem(page);
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("FOLD_PARENT");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("FOLD_CHILD");
  await page.keyboard.press("Tab");
  const foldParent = topItems(page).filter({ hasText: "FOLD_PARENT" }).last();
  await foldParent.locator(":scope > .river-outline-controls > .river-outline-toggle").click();
  await expect(foldParent).toHaveAttribute("data-collapsed", "true");
  await expect(foldParent.locator(".river-outline-item").filter({ hasText: "FOLD_CHILD" })).toHaveCount(1);
  await page.waitForTimeout(350);
  await screenshot(page, "12-folded-subtree.png");
  await foldParent.locator(":scope > .river-outline-controls > .river-outline-toggle").click();
  await expect(foldParent).toHaveAttribute("data-collapsed", "false");

  // Drag reorder with a stable data-order assertion.
  await newSibling(page, "DRAG_A");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("DRAG_B");
  await page.waitForTimeout(200);
  const dragA = page.locator(".river-editor-layout .river-outline-item").filter({ hasText: "DRAG_A" }).last();
  const dragB = page.locator(".river-editor-layout .river-outline-item").filter({ hasText: "DRAG_B" }).last();
  await dragA.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  const sourceBox = await dragA.locator(":scope > .river-outline-controls > .river-outline-drag-handle").boundingBox();
  expect(sourceBox).not.toBeNull();
  await dragA.locator(":scope > .river-outline-controls > .river-outline-drag-handle").hover();
  await page.mouse.down();
  // Scroll-into-view and hover can both move the page. Read the target only
  // after the pointer is down so the drag uses live viewport coordinates.
  const liveTargetBox = await dragB.boundingBox();
  expect(liveTargetBox).not.toBeNull();
  await page.mouse.move(liveTargetBox!.x + liveTargetBox!.width / 2, liveTargetBox!.y + liveTargetBox!.height - 2, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => {
    const texts = await page.locator(".river-editor-layout .river-outline-item > .river-outline-content > p").allTextContents();
    return texts.lastIndexOf("DRAG_A") > texts.lastIndexOf("DRAG_B")
      && texts.lastIndexOf("DRAG_B") >= 0
      && texts.lastIndexOf("DRAG_A") >= 0;
  }).toBe(true);
  await page.waitForTimeout(350);
  await screenshot(page, "13-drag-reorder.png");

  // Persistence: leave the editor, reload the app, reopen the note.
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: "返回笔记库" }).click();
  await page.waitForTimeout(500);
  await page.reload();
  const card = page.locator("article.tmi-note").filter({ hasText: title });
  await expect(card).toHaveCount(1);
  await card.getByRole("button", { name: "打开" }).click();
  await page.waitForSelector(".river-editor-layout .river-outline-editor");
  await expect(page.locator(".river-editor-layout .river-outline-editor")).toContainText("DRAG_A");
  await expect(page.locator(".river-editor-layout .river-outline-editor")).toContainText("SLASH_HEADING");
  await page.waitForTimeout(450);
  await screenshot(page, "14-reopen-after-reload.png");

  const finalDom = {
    topLevelTexts: await topItems(page).locator(":scope > .river-outline-content > p").allTextContents(),
    itemCount: await page.locator(".river-editor-layout .river-outline-item").count(),
    headingCount: await page.locator('.river-editor-layout .river-outline-item[data-heading="2"]').count(),
    hasPink: await page.locator(".river-editor-layout .river-semantic-pink").count(),
    hasAnnotation: await page.locator(".river-editor-layout .river-semantic-annotation").count(),
    hasComment: await page.locator(".river-editor-layout .river-semantic-comment").count(),
  };
  const finalDoc = await page.evaluate(() => (window as any).__riverEditor.getJSON());
  fs.writeFileSync(
    path.join(evidenceRoot, "master-evidence.json"),
    JSON.stringify({
      title,
      generatedAt: new Date().toISOString(),
      url: page.url(),
      pastedLines,
      rapidCount: rapid.length,
      finalDom,
      finalDoc,
    }, null, 2),
  );
});
