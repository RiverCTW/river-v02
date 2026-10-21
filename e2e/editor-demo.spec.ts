import { expect, test } from "@playwright/test";

test.use({
  video: {
    mode: "on",
    size: { width: 1440, height: 900 },
  },
});

test("records the River Effie editor workflow", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "+ 新建笔记" }).click();
  await expect(page.getByRole("button", { name: "返回笔记库" })).toBeVisible();
  await page.waitForTimeout(400);

  await page.locator(".river-editor-toolbar input").fill("生命周期评估");
  await page.locator(".river-editor-toolbar input").press("Tab");
  await page.locator('.river-editor-layout .river-outline-item[data-item-type="knowledge"]').first().locator("p").first().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(180);
  await page.keyboard.type("LCA 的四个步骤");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(180);
  await page.keyboard.type("确定目标与范围");
  await page.keyboard.press("Tab");
  await page.waitForTimeout(150);
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(180);
  await page.keyboard.type("清单分析");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(180);
  await page.keyboard.type("影响评估");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(180);
  await page.keyboard.type("结果解释");
  await page.keyboard.press("Shift+Tab");
  await page.waitForTimeout(180);
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(180);
  await page.keyboard.type("**产品生命周期** 是从获取、制造、使用到处置的完整过程。");
  await page.waitForTimeout(450);

  const foldable = page.locator(".river-outline-editor > ul > li.river-outline-item").first();
  await foldable.locator(":scope > .river-outline-controls > .river-outline-toggle").click();
  await page.waitForTimeout(350);
  await foldable.locator(":scope > .river-outline-controls > .river-outline-toggle").click();
  await page.waitForTimeout(350);

  await page.getByRole("button", { name: "专注" }).click();
  await page.waitForTimeout(450);
  await page.getByRole("button", { name: "恢复布局" }).click();
  await page.waitForTimeout(350);
  await page.getByRole("button", { name: "返回笔记库" }).click();
  await page.waitForTimeout(450);

  const generatedNote = page.locator("article.tmi-note").first();
  await generatedNote.getByRole("button", { name: "打开" }).click();
  await expect(page.getByRole("button", { name: "返回笔记库" })).toBeVisible();
  const firstKnowledge = page.locator('.river-editor-layout .river-outline-item[data-item-type="knowledge"] > .river-outline-content > p').first();
  await firstKnowledge.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" · 已编辑");
  await page.waitForTimeout(700);
});
