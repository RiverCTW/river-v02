import { expect, test, type Page } from "@playwright/test";

const rootParagraph = (page: Page) =>
  page.locator('.river-editor-layout .river-outline-item[data-item-type="knowledge"]')
    .first().locator(":scope > .river-outline-content > p").first();

const topLevelItems = (page: Page) =>
  page.locator(".river-editor-layout .river-outline-editor > ul > li.river-outline-item");

async function readDbDoc(page: Page, title: string): Promise<any> {
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

test("WebKit smoke: typing, Enter, heading, slash menu and persistence", async ({ page }) => {
  const title = `WEBKIT-${Date.now().toString(36)}`;
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/");
  await page.getByRole("button", { name: "+ 新建笔记" }).click();
  await page.waitForSelector(".river-editor-layout .river-outline-editor");
  await page.locator(".river-editor-toolbar input").fill(title);
  await page.locator(".river-editor-toolbar input").press("Tab");
  await rootParagraph(page).click();
  await page.keyboard.press("End");

  await page.keyboard.press("Enter");
  await expect(topLevelItems(page)).toHaveCount(2);
  await page.keyboard.insertText("WEBKIT_TEXT");
  await page.keyboard.press("Enter");
  await page.keyboard.type("## WEBKIT_HEADING");

  const heading = page.locator('.river-outline-item[data-item-type="knowledge"]')
    .filter({ hasText: "WEBKIT_HEADING" }).last();
  await expect(heading).toHaveAttribute("data-heading", "2");
  await expect(heading.locator(":scope > .river-outline-content > p")).toHaveText("WEBKIT_HEADING");

  await page.keyboard.press("Enter");
  await page.keyboard.type("/");
  await expect(page.locator(".river-slash-menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".river-slash-menu")).toHaveCount(0);

  await expect.poll(async () => {
    const doc = await readDbDoc(page, title);
    return JSON.stringify(doc ?? {});
  }, { intervals: [100, 200, 400], timeout: 20_000 }).toContain("WEBKIT_TEXT");
  await expect.poll(async () => {
    const doc = await readDbDoc(page, title);
    return JSON.stringify(doc ?? {});
  }, { intervals: [100, 200, 400], timeout: 20_000 }).toContain("WEBKIT_HEADING");

  await page.reload();
  const card = page.locator("article.tmi-note").filter({ hasText: title });
  await expect(card).toHaveCount(1);
  await card.getByRole("button", { name: "打开" }).click();
  await page.waitForSelector(".river-editor-layout .river-outline-editor");
  await expect(page.locator(".river-outline-item").filter({ hasText: "WEBKIT_TEXT" })).toHaveCount(1);
  await expect(page.locator('.river-outline-item[data-heading="2"]').filter({ hasText: "WEBKIT_HEADING" })).toHaveCount(1);
  expect(consoleErrors).toEqual([]);
});
