import { expect, test, type Page } from "@playwright/test";

const editor = (page: Page) => page.locator(".river-editor-layout .river-outline-editor");
const bodyItems = (page: Page) => editor(page).locator(":scope > ul > li.river-outline-item");

async function itemByExactText(page: Page, text: string) {
  const id = await page.evaluate((wanted) => {
    const items = Array.from(document.querySelectorAll<HTMLElement>("li.river-outline-item"));
    return items.find((item) => item.querySelector(":scope > .river-outline-content > p")?.textContent === wanted)?.dataset.nodeId || null;
  }, text);
  if (!id) throw new Error(`找不到文本为 ${text} 的列表项`);
  return page.locator(`li.river-outline-item[data-node-id="${id}"]`);
}

async function openFreshNote(page: Page, title: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "+ 新建笔记" }).click();
  await editor(page).waitFor();
  const titleInput = page.locator(".river-editor-toolbar input");
  await titleInput.fill(title);
  await titleInput.press("Tab");
  const root = editor(page).locator(".river-outline-item > .river-outline-content > p").first();
  await root.click();
  await page.keyboard.press("End");
}

test("V021-EDITOR: middle Enter splits a nested item as a sibling and Backspace merges it", async ({ page }) => {
  await openFreshNote(page, "V021 编辑器结构验收");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- 语文");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("文言文");
  await page.keyboard.press("Enter");
  await page.keyboard.type("作文");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("开头");
  await page.keyboard.press("Enter");
  await page.keyboard.type("素材，结尾");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Enter");

  const splitTail = await itemByExactText(page, "尾");
  await expect(splitTail.locator(":scope > .river-outline-content > p")).toHaveText("尾");
  const splitHead = await itemByExactText(page, "素材，结");
  await expect(splitHead).toHaveCount(1);

  await page.keyboard.press("Backspace");
  await expect(splitTail).toHaveCount(0);
  await expect(await itemByExactText(page, "素材，结尾")).toHaveCount(1);
});

test("V021-UNDO: collapse is persisted but does not consume one Undo step", async ({ page }) => {
  await openFreshNote(page, "V021 折叠撤销验收");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- PARENT");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("CHILD");
  const parent = await itemByExactText(page, "PARENT");
  await parent.locator(":scope > .river-outline-controls > .river-outline-toggle").click();
  await expect(parent).toHaveAttribute("data-collapsed", "true");

  await page.keyboard.press("Meta+z");
  await expect(parent).toHaveAttribute("data-collapsed", "true");
});
