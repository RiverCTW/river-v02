import { expect, test, type Page } from "@playwright/test";

const editor = (page: Page) => page.locator(".river-editor-layout .river-outline-editor").first();
const rootItems = (page: Page) => editor(page).locator("> ul > li.river-outline-item");

test("dragging an outline item follows the pointer and reorders the document", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "+ 新建笔记" }).click();
  await editor(page).waitFor();
  const first = rootItems(page).first();
  await first.locator(":scope > .river-outline-content > p").click();
  await page.keyboard.press("End");
  await page.keyboard.type("第一行");
  await page.keyboard.press("Enter");
  await page.keyboard.type("第二行");
  await page.keyboard.press("Enter");
  await page.keyboard.type("第三行");
  await page.waitForTimeout(300);

  const texts = async () => rootItems(page).locator(":scope > .river-outline-content > p").allTextContents();
  const before = (await texts()).slice(0, 3);
  expect(before[0]).toContain("第一行");
  expect(before.slice(1)).toEqual(["第二行", "第三行"]);

  const handle = rootItems(page).nth(2).locator(".river-outline-drag-handle");
  const source = await handle.boundingBox();
  const target = await rootItems(page).nth(1).boundingBox();
  expect(source).not.toBeNull();
  expect(target).not.toBeNull();
  if (!source || !target) return;

  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(120);
  for (let step = 1; step <= 8; step += 1) {
    await page.mouse.move(
      source.x + ((target.x + target.width * 0.5 - source.x) * step) / 8,
      source.y + ((target.y + target.height * 0.3 - source.y) * step) / 8,
    );
    await page.waitForTimeout(40);
  }
  await expect(page.locator(".river-drag-ghost")).toHaveCount(1);
  await page.mouse.up();
  await page.waitForTimeout(500);

  const after = (await texts()).slice(0, 3);
  expect(after[0]).toContain("第一行");
  expect(after.slice(1)).toEqual(["第三行", "第二行"]);
  await expect(page.locator(".river-drag-ghost")).toHaveCount(0);
});
