import { expect, test, type Page } from "@playwright/test";

const PASTE_SAMPLES: Array<{ id: string; text: string }> = [
  { id: "two-chinese-lines", text: "第一行中文\n第二行中文" },
  { id: "three-english-lines", text: "alpha line one\nbeta line two\ngamma line three" },
  { id: "ten-chinese-lines", text: Array.from({ length: 10 }, (_, index) => `第${index + 1}条中文内容`).join("\n") },
  { id: "blank-lines", text: "第一段\n\n第三段\n\n\n第六段" },
  { id: "indented-list", text: "- 一级条目\n  - 二级条目\n  - 二级条目二\n- 一级条目二" },
  { id: "heading-markers", text: "# 一级标题\n## 二级标题\n正文内容\n### 三级标题" },
  { id: "mixed-script-emoji", text: "River 学习笔记：第一行 🚀\n第二行，包含 English、标点！\n第三行 emoji 😀✨" },
];

function uniqueTitle(label: string): string {
  return `REPAIR-${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

const rootParagraph = (page: Page) =>
  page.locator('.river-editor-layout .river-outline-item[data-item-type="knowledge"]')
    .first().locator(":scope > .river-outline-content > p").first();

const topLevelItems = (page: Page) =>
  page.locator(".river-editor-layout .river-outline-editor > ul > li.river-outline-item");

async function createTestNote(page: Page, title: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "+ 新建笔记" }).click();
  await page.waitForSelector(".river-editor-layout .river-outline-editor");
  const titleInput = page.locator(".river-editor-toolbar input");
  await titleInput.fill(title);
  await titleInput.press("Tab");
  await rootParagraph(page).click();
  await page.keyboard.press("End");
}

/** Creates a fresh empty sibling and leaves the caret inside it. */
async function createEmptySibling(page: Page): Promise<void> {
  const before = await topLevelItems(page).count();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(topLevelItems(page)).toHaveCount(before + 1);
}

async function pasteText(page: Page, text: string): Promise<void> {
  await page.evaluate(async (value) => navigator.clipboard.writeText(value), text);
  await page.keyboard.press("Meta+v");
}

async function lastItemParagraphs(page: Page): Promise<string[]> {
  return topLevelItems(page).last().locator(":scope > .river-outline-content > p").allTextContents();
}

async function readDbEditorDoc(page: Page, title: string): Promise<any> {
  return page.evaluate(async (wantedTitle) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("river-v0.1");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const notes = await new Promise<any[]>((resolve, reject) => {
      const request = database.transaction("notes").objectStore("notes").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return notes.find((note) => note.title === wantedTitle)?.editorDoc ?? null;
  }, title);
}

function paragraphsOfLastRootItem(doc: any): string[] {
  const list = doc?.content?.[doc.content.length - 1];
  const item = list?.content?.[list.content.length - 1];
  return (item?.content || [])
    .filter((child: any) => child.type === "paragraph")
    .map((paragraph: any) => (paragraph.content || []).map((text: any) => text.text || "").join(""));
}

async function openNoteByTitle(page: Page, title: string): Promise<void> {
  await page.goto("/");
  const card = page.locator("article.tmi-note").filter({ hasText: title });
  await expect(card).toHaveCount(1, { timeout: 15_000 });
  await card.getByRole("button", { name: "打开" }).click();
  await expect(page.locator(".river-editor-layout .river-outline-editor")).toBeVisible();
}

async function waitForPersistedText(page: Page, title: string, expected: string): Promise<void> {
  await expect.poll(async () => JSON.stringify(await readDbEditorDoc(page, title)) ?? "", {
    timeout: 15_000,
    intervals: [50, 100, 200],
  }).toContain(JSON.stringify(expected).slice(1, -1));
}

for (const sample of PASTE_SAMPLES) {
  test(`P0 paste ${sample.id} survives DOM, editorDoc and reopen`, async ({ page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:5174" });
    const title = uniqueTitle(sample.id);
    await createTestNote(page, title);
    await createEmptySibling(page);
    await pasteText(page, sample.text);

    const expectedLines = sample.text.split("\n");
    await expect.poll(() => lastItemParagraphs(page)).toEqual(expectedLines);
    await expect.poll(async () => paragraphsOfLastRootItem(await readDbEditorDoc(page, title))).toEqual(expectedLines);

    await openNoteByTitle(page, title);
    const reopened = page.locator(".river-editor-layout .river-outline-editor > ul > li.river-outline-item").last();
    await expect.poll(() => reopened.locator(":scope > .river-outline-content > p").allTextContents()).toEqual(expectedLines);
    await expect(page.locator(".river-editor-layout .river-outline-item[data-item-type='knowledge']")).toHaveCount(2);
  });
}

test("P0 paste at the end of non-empty text keeps both segments", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:5174" });
  const title = uniqueTitle("paste-nonempty");
  await createTestNote(page, title);
  await createEmptySibling(page);
  await page.keyboard.insertText("HEAD");
  await page.keyboard.press("End");
  await pasteText(page, "A\nB");
  await expect.poll(() => lastItemParagraphs(page)).toEqual(["HEADA", "B"]);
});

test("P0 paste in the middle of a line keeps the right-hand tail", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:5174" });
  const title = uniqueTitle("paste-middle");
  await createTestNote(page, title);
  await createEmptySibling(page);
  await page.keyboard.insertText("HEADTAIL");
  for (let index = 0; index < 4; index += 1) await page.keyboard.press("ArrowLeft");
  await pasteText(page, "X\nY");
  await expect.poll(() => lastItemParagraphs(page)).toEqual(["HEADX", "YTAIL"]);
});

test("P0 paste replaces a selected range without duplicating text", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:5174" });
  const title = uniqueTitle("paste-selection");
  await createTestNote(page, title);
  await createEmptySibling(page);
  await page.keyboard.insertText("HEADTAIL");
  for (let index = 0; index < 4; index += 1) await page.keyboard.press("Shift+ArrowLeft");
  await pasteText(page, "Z\nW");
  await expect.poll(() => lastItemParagraphs(page)).toEqual(["HEADZ", "W"]);
});

async function runRapidEntries(page: Page, count: number): Promise<void> {
  for (let index = 1; index <= count; index += 1) {
    await page.keyboard.insertText(`ITEM_${String(index).padStart(3, "0")}`);
    if (index < count) await page.keyboard.press("Enter");
  }
}

for (const count of [100, 500]) {
  test(`P0 ${count} rapid entries keep exact order, identity and persistence`, async ({ page }) => {
    test.setTimeout(180_000);
    const title = uniqueTitle(`rapid-${count}`);
    await createTestNote(page, title);
    await createEmptySibling(page);
    await runRapidEntries(page, count);

    const expected = Array.from({ length: count }, (_, index) => `ITEM_${String(index + 1).padStart(3, "0")}`);
    const live = await page.evaluate(() => {
      const editor = (window as any).__riverEditor;
      const items: Array<{ id: string; text: string }> = [];
      editor.state.doc.descendants((node: any) => {
        if (node.type.name === "listItem" && node.attrs.itemType !== "block") {
          items.push({ id: node.attrs.nodeId, text: node.textContent });
        }
        return true;
      });
      return items;
    });
    const texts = live.slice(1).map((item) => item.text);
    expect(texts).toEqual(expected);
    expect(new Set(live.map((item) => item.id)).size).toBe(live.length);
    expect(texts.filter((text) => !text.trim())).toEqual([]);

    await waitForPersistedText(page, title, `ITEM_${String(count).padStart(3, "0")}`);
    await openNoteByTitle(page, title);
    const reopenedTexts = await page.locator(".river-editor-layout .river-outline-editor > ul > li.river-outline-item > .river-outline-content > p").allTextContents();
    expect(reopenedTexts).toEqual([title, ...expected]);
    await expect(page.locator(".river-editor-layout .river-outline-item[data-item-type='knowledge']")).toHaveCount(count + 1);
  });
}

test("P0 select-all delete leaves one editable outline item and undo restores everything", async ({ page }) => {
  const title = uniqueTitle("clear-undo");
  await createTestNote(page, title);
  await createEmptySibling(page);
  await page.keyboard.insertText("SECOND");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("CHILD");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("THIRD");

  const before = await page.evaluate(() => {
    const editor = (window as any).__riverEditor;
    return {
      text: editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n"),
      roots: editor.getJSON().content.map((node: any) => node.type),
      items: editor.getJSON().content.flatMap((list: any) => list.content || []).length,
    };
  });
  expect(before.roots).toEqual(["bulletList"]);

  await page.keyboard.press("Meta+a");
  await page.keyboard.press("Backspace");
  await expect.poll(async () => page.evaluate(() => (window as any).__riverEditor.getJSON().content.map((node: any) => node.type))).toEqual(["bulletList"]);
  await expect.poll(async () => page.evaluate(() => (window as any).__riverEditor.getJSON().content[0].content.length)).toBe(1);
  await page.keyboard.insertText("AFTER-CLEAR");
  await expect(page.locator(".river-editor-layout .river-outline-editor")).toContainText("AFTER-CLEAR");

  await page.keyboard.press("Meta+z");
  await page.keyboard.press("Meta+z");
  await expect.poll(async () => page.evaluate(() => {
    const editor = (window as any).__riverEditor;
    return editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n");
  })).toBe(before.text);

  await openNoteByTitle(page, title);
  await expect(page.locator(".river-editor-layout .river-outline-editor")).toContainText("THIRD");
  await expect(page.locator(".river-editor-layout .river-outline-item[data-item-type='knowledge']")).toHaveCount(4);
});

test("P1 Shift+Tab lifts only the current item and preserves parent, siblings and reload", async ({ page }) => {
  const title = uniqueTitle("outdent");
  await createTestNote(page, title);
  await createEmptySibling(page);
  await page.keyboard.insertText("PARENT");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("CHILD");
  await page.keyboard.press("Tab");
  await expect(page.locator(".river-editor-layout .river-outline-editor ul ul .river-outline-item").filter({ hasText: "CHILD" })).toHaveCount(1);

  await page.keyboard.press("Shift+Tab");
  await expect(page.locator(".river-editor-layout .river-outline-editor > ul > li.river-outline-item").filter({ hasText: "CHILD" })).toHaveCount(1);
  await expect(page.locator(".river-editor-layout .river-outline-editor > ul > li.river-outline-item").filter({ hasText: "PARENT" })).toHaveCount(1);
  await expect(page.locator(".river-editor-layout .river-outline-editor > ul > li.river-outline-item").filter({ hasText: "CHILD" })).toHaveCount(1);
  await expect.poll(() => topLevelItems(page).locator(":scope > .river-outline-content > p").allTextContents()).toEqual([title, "PARENT", "CHILD"]);
});

test("P1 Enter with a text selection replaces the range and undo restores the original item", async ({ page }) => {
  const title = uniqueTitle("selection-enter");
  await createTestNote(page, title);
  await createEmptySibling(page);
  await page.keyboard.insertText("ALPHA BETA");
  await page.keyboard.press("Home");
  for (let index = 0; index < 5; index += 1) await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Enter");

  const texts = await topLevelItems(page).locator(":scope > .river-outline-content > p").allTextContents();
  expect(texts).toEqual([title, "", " BETA"]);
  await page.keyboard.press("Meta+z");
  await expect.poll(() => topLevelItems(page).locator(":scope > .river-outline-content > p").allTextContents()).toEqual([title, "ALPHA BETA"]);
});

test("P1 slash menu executes the Effie command panel and closes with Escape", async ({ page }) => {
  const title = uniqueTitle("slash");
  await createTestNote(page, title);
  await createEmptySibling(page);
  await page.keyboard.type("/");
  const menu = page.locator(".river-slash-menu");
  await expect(menu).toBeVisible();
  await menu.getByTestId("river-slash-h2").click();
  await expect(menu).toHaveCount(0);
  await page.keyboard.insertText("SLASH-H2");
  const item = page.locator(".river-editor-layout .river-outline-item[data-item-type='knowledge']").filter({ hasText: "SLASH-H2" }).last();
  await expect(item).toHaveAttribute("data-heading", "2");
  await expect(item.locator(":scope > .river-outline-content > p")).toHaveText("SLASH-H2");

  const secondTitle = title;
  await page.keyboard.press("Enter");
  await page.keyboard.type("/");
  await expect(page.locator(".river-slash-menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".river-slash-menu")).toHaveCount(0);
  await expect.poll(async () => page.evaluate(() => (window as any).__riverEditor.state.doc.textBetween(0, (window as any).__riverEditor.state.doc.content.size, "\n"))).toContain(secondTitle);
});

test("P1 heading and list markers convert only the current item and survive reopen", async ({ page }) => {
  const title = uniqueTitle("rules");
  await createTestNote(page, title);
  await createEmptySibling(page);
  await page.keyboard.insertText("BULLET-A");
  await page.keyboard.press("Enter");
  await page.keyboard.type("1. ");
  await page.keyboard.insertText("ORDERED-B");
  const orderedItem = page.locator(".river-editor-layout .river-outline-editor > ol > li.river-outline-item").filter({ hasText: "ORDERED-B" });
  await expect(orderedItem).toHaveCount(1);
  await expect(page.locator(".river-editor-layout .river-outline-editor > ul > li.river-outline-item").filter({ hasText: "BULLET-A" })).toHaveCount(1);

  await page.keyboard.press("Enter");
  await page.keyboard.type("# ");
  await page.keyboard.insertText("HEADING-A");
  const heading = page.locator(".river-editor-layout .river-outline-item[data-item-type='knowledge']").filter({ hasText: "HEADING-A" }).last();
  await expect(heading).toHaveAttribute("data-heading", "1");

  const lists = await page.evaluate(() => (window as any).__riverEditor.getJSON().content.map((node: any) => node.type));
  expect(lists).toEqual(expect.arrayContaining(["bulletList", "orderedList"]));
});

test("P1 folding keeps the complete subtree and its collapsed state after reopen", async ({ page }) => {
  const title = uniqueTitle("fold");
  await createTestNote(page, title);
  await createEmptySibling(page);
  await page.keyboard.insertText("PARENT");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("CHILD");
  await page.keyboard.press("Tab");
  const parent = page.locator(".river-editor-layout .river-outline-editor > ul > li.river-outline-item").filter({ hasText: "PARENT" });
  await parent.locator(":scope > .river-outline-controls > .river-outline-toggle").click();
  await expect(parent).toHaveAttribute("data-collapsed", "true");
  await waitForPersistedText(page, title, "CHILD");
  await openNoteByTitle(page, title);
  const reopenedParent = page.locator(".river-editor-layout .river-outline-editor > ul > li.river-outline-item").filter({ hasText: "PARENT" });
  await expect(reopenedParent).toHaveAttribute("data-collapsed", "true");
  await expect(reopenedParent.locator("ul .river-outline-item").filter({ hasText: "CHILD" })).toHaveCount(1);
});

test("P0 last keystroke is saved before returning to the library without waiting", async ({ page }) => {
  const title = uniqueTitle("instant-close");
  await createTestNote(page, title);
  await createEmptySibling(page);
  await page.keyboard.type("LAST-KEYSTROKE-42");
  await page.getByRole("button", { name: "返回笔记库" }).click();
  await expect(page.getByRole("button", { name: "返回笔记库" })).toHaveCount(0);
  await openNoteByTitle(page, title);
  await expect(page.locator(".river-editor-layout .river-outline-editor")).toContainText("LAST-KEYSTROKE-42");
  expect(JSON.stringify(await readDbEditorDoc(page, title))).toContain("LAST-KEYSTROKE-42");
});
