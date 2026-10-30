import { expect, test, type Page } from "@playwright/test";

async function createNote(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "+ 新建笔记" }).click();
  await expect(page.getByRole("button", { name: "返回笔记库" })).toBeVisible();
  await expect(page.locator(".river-editor-toolbar input")).toHaveValue("新建学习笔记");
  await page.locator('.river-editor-layout .river-outline-item[data-item-type="knowledge"]').first().locator("p").first().click();
}

async function addSibling(page: Page, text: string) {
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(250);
  await page.keyboard.type(text);
}

test("creates exactly one intended knowledge root for a fresh note", async ({ page }) => {
  await createNote(page);
  await expect(page.locator('.river-editor-layout .river-outline-item[data-item-type="knowledge"]')).toHaveCount(1);
  await expect(page.locator('.river-editor-layout .river-outline-item[data-item-type="block"]')).toHaveCount(1);
  await expect(page.getByText("未命名知识点", { exact: true })).toHaveCount(0);
});

test("continues typing in the new item after Enter", async ({ page }) => {
  await createNote(page);
  await addSibling(page, "ABC");
  await expect(page.locator('.river-outline-item[data-item-type="knowledge"]').filter({ hasText: "ABC" })).toHaveCount(1);
});

test("renders real-time markers and preserves visible marker text", async ({ page }) => {
  await createNote(page);
  await addSibling(page, "**粉色重点** *金色斜体* ::黄色标注:: ++评论++ ~~删除~~ `代码`");
  await expect(page.locator(".river-editor-layout .river-semantic-pink")).toContainText("**粉色重点**");
  await expect(page.locator(".river-editor-layout .river-semantic-gold")).toContainText("*金色斜体*");
  await expect(page.locator(".river-editor-layout .river-semantic-annotation")).toContainText("::黄色标注::");
  await expect(page.locator(".river-editor-layout .river-semantic-comment")).toContainText("++评论++");
  await expect(page.locator(".river-editor-layout .river-semantic-strike")).toContainText("~~删除~~");
  await expect(page.locator(".river-editor-layout .river-semantic-code")).toContainText("`代码`");
});

test("supports unclosed markers deterministically", async ({ page }) => {
  await createNote(page);
  await addSibling(page, "**这是一个未闭合重点");
  await expect(page.locator(".river-editor-layout .river-semantic-pink")).toContainText("**这是一个未闭合重点");
});

test("edits text inside a visible semantic marker range", async ({ page }) => {
  await createNote(page);
  await addSibling(page, "**重点**");
  const item = page.locator('.river-editor-layout .river-outline-item[data-item-type="knowledge"]').filter({ hasText: "**重点**" }).last();
  const itemId = await item.getAttribute("data-node-id");
  expect(itemId).toBeTruthy();
  const stableItem = page.locator(`[data-node-id="${itemId}"]`);
  const ownParagraph = stableItem.locator(":scope > .river-outline-content > p");
  await ownParagraph.click();
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.type("改");
  await expect(ownParagraph).toHaveText("**重点改**");
  await expect(stableItem.locator(".river-semantic-pink")).toContainText("**重点改**");
});

test("converts a line-start heading command into a real heading block", async ({ page }) => {
  await createNote(page);
  await addSibling(page, "HEADING_TARGET");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("# 生命周期评估");
  const stableItem = page.locator('.river-editor-layout .river-outline-item[data-item-type="knowledge"]').filter({ hasText: "生命周期评估" }).last();
  await expect(stableItem).toHaveAttribute("data-heading", "1");
  await expect(stableItem.locator(":scope > .river-outline-content > p")).toHaveText("生命周期评估");
});

test("supports H1 through H6 heading commands", async ({ page }) => {
  await createNote(page);
  for (let level = 1; level <= 6; level += 1) {
    const text = `H${level}标题`;
    await addSibling(page, `${"#".repeat(level)} ${text}`);
    const item = page.locator('.river-editor-layout .river-outline-item[data-item-type="knowledge"]')
      .filter({ has: page.locator(`:scope > .river-outline-content > p`, { hasText: text }) });
    await expect(item).toHaveAttribute("data-heading", String(level));
    await expect(item.locator(":scope > .river-outline-content > p")).toHaveText(text);
  }
});

test("supports ordered-list input without leaving the structural outline", async ({ page }) => {
  await createNote(page);
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("1. 第一项");
  await expect(page.locator(".river-outline-editor > ol .river-outline-item").filter({ hasText: "第一项" })).toHaveCount(1);
});

test("supports Tab and Shift+Tab on real structural nodes", async ({ page }) => {
  await createNote(page);
  await addSibling(page, "B");
  await page.keyboard.press("Tab");
  const root = page.locator('.river-outline-item[data-item-type="knowledge"]').first();
  await expect(root.locator('ul .river-outline-item[data-item-type="knowledge"]').filter({ hasText: "B" })).toHaveCount(1);
  await page.keyboard.press("Shift+Tab");
  await expect(root.locator('ul .river-outline-item[data-item-type="knowledge"]').filter({ hasText: "B" })).toHaveCount(0);
});

test("creates a sibling when Enter is pressed at the end of a nested leaf", async ({ page }) => {
  await createNote(page);
  await addSibling(page, "PARENT");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(250);
  await page.keyboard.type("CHILD");
  await page.keyboard.press("Tab");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(250);
  await page.keyboard.type("NEXT");
  const parent = page.locator(".river-outline-editor > ul > li.river-outline-item").nth(1);
  const childItems = parent.locator("ul .river-outline-item");
  await expect(childItems).toHaveCount(2);
  await expect(childItems.filter({ hasText: "CHILD" })).toHaveCount(1);
  await expect(childItems.filter({ hasText: "NEXT" })).toHaveCount(1);
});

test("folds and expands a complete subtree without deleting it", async ({ page }) => {
  await createNote(page);
  await addSibling(page, "B");
  await page.keyboard.press("Tab");
  const root = page.locator('.river-outline-item[data-item-type="knowledge"]').first();
  const toggle = root.locator("button.river-outline-toggle").first();
  const uniqueItems = () => page.locator("[data-node-id]").evaluateAll((elements) => Array.from(new Set(elements.map((element) => element.getAttribute("data-node-id")))).filter(Boolean));
  await toggle.click();
  await expect(root).toHaveAttribute("data-collapsed", "true");
  await toggle.click();
  await expect(root).toHaveAttribute("data-collapsed", "false");
  await expect(page.locator('.river-outline-item[data-item-type="knowledge"] p').filter({ hasText: /^B$/ })).toHaveCount(1);
});

test("deletes a structurally selected subtree and restores it with undo", async ({ page }) => {
  await createNote(page);
  await addSibling(page, "B");
  await page.keyboard.press("Tab");
  const uniqueKnowledgeIds = () => page.locator('.river-outline-item[data-item-type="knowledge"][data-node-id]').evaluateAll((elements) => Array.from(new Set(elements.map((element) => element.getAttribute("data-node-id")))).filter(Boolean));
  expect((await uniqueKnowledgeIds()).length).toBe(2);
  await page.evaluate(() => {
    const editor = (window as any).__riverEditor;
    let firstPosition: number | null = null;
    editor.state.doc.descendants((node: any, position: number) => {
      if (firstPosition === null && node.type.name === "listItem" && node.attrs.itemType === "knowledge") {
        firstPosition = position;
        return false;
      }
      return true;
    });
    if (firstPosition === null) throw new Error("No structural list item found");
    editor.commands.setNodeSelection(firstPosition);
  });
  await expect.poll(async () => page.evaluate(() => (window as any).__riverEditor.state.selection.constructor.name)).toBe("NodeSelection");
  await page.keyboard.press("Delete");
  expect((await uniqueKnowledgeIds()).length).toBe(1);
  await page.keyboard.press("Meta+z");
  expect((await uniqueKnowledgeIds()).length).toBe(2);
});

test("moves a complete subtree by drag and restores it with undo", async ({ page }) => {
  await createNote(page);
  await addSibling(page, "MOVE-ME");
  await addSibling(page, "TARGET");
  const rootItems = page.locator(".river-outline-editor > ul > li.river-outline-item");
  await expect(rootItems).toHaveCount(3);
  const sourceBox = await rootItems.nth(1).locator(".river-outline-drag-handle").boundingBox();
  const targetBox = await rootItems.nth(2).boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  await rootItems.nth(1).locator(".river-outline-drag-handle").hover();
  await page.mouse.down();
  const liveTargetBox = await rootItems.nth(2).boundingBox();
  expect(liveTargetBox).not.toBeNull();
  await page.mouse.move(liveTargetBox!.x + liveTargetBox!.width / 2, liveTargetBox!.y + liveTargetBox!.height - 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => rootItems.locator(":scope > .river-outline-content > p").allTextContents()).toEqual([
    "新建学习笔记",
    "TARGET",
    "MOVE-ME",
  ]);
  await page.keyboard.press("Meta+z");
  await expect.poll(async () => rootItems.locator(":scope > .river-outline-content > p").allTextContents()).toEqual([
    "新建学习笔记",
    "MOVE-ME",
    "TARGET",
  ]);
});

test("keeps descendants attached when dragging a parent subtree", async ({ page }) => {
  await createNote(page);
  await addSibling(page, "TARGET");
  const rootItems = page.locator(".river-outline-editor > ul > li.river-outline-item");
  await expect(rootItems).toHaveCount(2);
  const parent = rootItems.nth(0);
  const target = rootItems.nth(1);
  await parent.locator(":scope > .river-outline-controls > .river-outline-drag-handle").hover();
  await page.mouse.down();
  const liveTargetBox = await target.boundingBox();
  expect(liveTargetBox).not.toBeNull();
  await page.mouse.move(liveTargetBox!.x + liveTargetBox!.width / 2, liveTargetBox!.y + liveTargetBox!.height - 2, { steps: 8 });
  await page.mouse.up();

  await expect.poll(async () => rootItems.locator(":scope > .river-outline-content > p").allTextContents()).toEqual([
    "TARGET",
    "新建学习笔记",
  ]);
  await expect(rootItems.nth(1).locator("ul .river-outline-item").filter({ hasText: "开始记录你的学习内容。" })).toHaveCount(1);
  await page.keyboard.press("Meta+z");
  await expect.poll(async () => rootItems.locator(":scope > .river-outline-content > p").allTextContents()).toEqual([
    "新建学习笔记",
    "TARGET",
  ]);
});

test("persists content across reload", async ({ page }) => {
  await createNote(page);
  await addSibling(page, "PERSIST-ME");
  await expect(page.locator('.river-outline-item[data-item-type="knowledge"]')).toHaveCount(2);
  await page.waitForTimeout(700);
  await page.reload();
  await page.waitForTimeout(700);
  await expect(page.locator(".river-outline-editor")).toContainText("PERSIST-ME");
  await expect(page.locator('.river-outline-item[data-item-type="knowledge"]')).toHaveCount(2);
  await expect(page.getByText("未命名知识点", { exact: true })).toHaveCount(0);
});

test("keeps separate notes isolated when creating and reopening them", async ({ page }) => {
  await createNote(page);
  await page.locator(".river-editor-toolbar input").fill("笔记 A");
  await page.locator(".river-editor-toolbar input").press("Tab");
  await page.locator('.river-editor-layout .river-outline-item[data-item-type="knowledge"]').first().locator("p").first().click();
  await addSibling(page, "ONLY-NOTE-A");
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "返回笔记库" }).click();

  await page.getByRole("button", { name: "+ 新建笔记" }).click();
  await expect(page.getByRole("button", { name: "返回笔记库" })).toBeVisible();
  await page.locator(".river-editor-toolbar input").fill("笔记 B");
  await page.locator(".river-editor-toolbar input").press("Tab");
  await page.locator('.river-editor-layout .river-outline-item[data-item-type="knowledge"]').first().locator("p").first().click();
  await addSibling(page, "ONLY-NOTE-B");
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "返回笔记库" }).click();

  const noteA = page.locator("article.tmi-note").filter({ hasText: "笔记 A" });
  const noteB = page.locator("article.tmi-note").filter({ hasText: "笔记 B" });
  await expect(noteA).toHaveCount(1);
  await expect(noteB).toHaveCount(1);
  await noteA.getByRole("button", { name: "打开" }).click();
  await expect(page.locator(".river-outline-editor")).toContainText("ONLY-NOTE-A");
  await expect(page.locator(".river-outline-editor")).not.toContainText("ONLY-NOTE-B");
  await page.getByRole("button", { name: "返回笔记库" }).click();
  await noteB.getByRole("button", { name: "打开" }).click();
  await expect(page.locator(".river-outline-editor")).toContainText("ONLY-NOTE-B");
  await expect(page.locator(".river-outline-editor")).not.toContainText("ONLY-NOTE-A");
});

test("focus mode expands the standalone editor without losing content", async ({ page }) => {
  await createNote(page);
  await addSibling(page, "FOCUS-ME");
  await page.getByRole("button", { name: "专注" }).click();
  await expect(page.locator(".river-editor-side")).toBeHidden();
  await expect(page.locator(".river-outline-editor")).toContainText("FOCUS-ME");
  await page.getByRole("button", { name: "恢复布局" }).click();
  await expect(page.locator(".river-editor-side")).toBeVisible();
  await expect(page.locator(".river-editor-layout")).not.toHaveClass(/is-focus/);
});

test("inline editor focus mode retains the River three-column shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".tmi-inline-editor")).toBeVisible();
  await page.locator(".tmi-inline-editor .river-focus-button").click();
  await expect(page.locator(".tmi-rail")).toBeHidden();
  await expect(page.locator(".tmi-listcol")).toBeHidden();
  await expect(page.locator(".tmi-inline-editor")).toBeVisible();
  await page.locator(".tmi-inline-editor .river-focus-button").click();
  await expect(page.locator(".tmi-rail")).toBeVisible();
  await expect(page.locator(".tmi-listcol")).toBeVisible();
});

test("edits an AI-like 120-node generated knowledge tree", async ({ page }) => {
  await createNote(page);
  await page.getByRole("button", { name: "生成 120 节点测试树" }).click();
  await expect(page.locator(".river-outline-item").filter({ hasText: "120 节点性能测试" })).toHaveCount(1, { timeout: 20_000 });
  const firstKnowledge = page.locator('.river-outline-item[data-item-type="knowledge"]').first().locator("p").first();
  await firstKnowledge.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" EDITED");
  await expect(firstKnowledge).toContainText("EDITED");
  const chapter = page.locator('.river-outline-item[data-item-type="knowledge"]').filter({ hasText: "测试章节 1" }).last();
  const chapterToggle = chapter.locator(":scope > .river-outline-controls > .river-outline-toggle");
  await chapterToggle.click();
  await expect(chapter).toHaveAttribute("data-collapsed", "true");
  await chapterToggle.click();
  await expect(chapter).toHaveAttribute("data-collapsed", "false");
  await expect(page.locator('.river-outline-item[data-item-type="knowledge"] > .river-outline-content > p').filter({ hasText: /^知识点 1\.1$/ })).toHaveCount(1);
});

test("does not create a node during IME composition", async ({ page }) => {
  await createNote(page);
  const uniqueKnowledgeIds = () => page.locator(".river-outline-item[data-item-type='knowledge'][data-node-id]").evaluateAll((elements) => Array.from(new Set(elements.map((element) => element.getAttribute("data-node-id")))).filter(Boolean));
  const before = (await uniqueKnowledgeIds()).length;
  await page.locator(".river-outline-editor").evaluate((element) => {
    element.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    Object.defineProperty(event, "isComposing", { value: true });
    element.dispatchEvent(event);
    element.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
  });
  expect((await uniqueKnowledgeIds()).length).toBe(before);
});
