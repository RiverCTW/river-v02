import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1920, height: 1080 } });

test("both split dividers resize their panes smoothly", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "+ 新建笔记" }).click();
  const openButton = page.getByRole("button", { name: "独立笔记页" }).first();
  await expect(openButton).toBeVisible();
  await openButton.click();
  await page.waitForTimeout(800);

  const divider = page.locator(".river-split-divider").first();
  const box = await divider.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  const split = page.locator(".river-resizable-split").first();
  const before = await split.evaluate((element) => element.style.gridTemplateColumns || element.style.gridTemplateRows);

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let step = 1; step <= 10; step += 1) {
    await page.mouse.move(box.x + box.width / 2 - step * 12, box.y + box.height / 2);
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
  await page.waitForTimeout(300);

  const after = await split.evaluate((element) => element.style.gridTemplateColumns || element.style.gridTemplateRows);
  expect(after).not.toBe(before);
  await expect(page.locator("body")).not.toHaveClass(/is-resizing-split/);
});
