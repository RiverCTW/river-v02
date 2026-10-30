import { expect, test, type Page } from "@playwright/test";

const editor = (page: Page) => page.locator(".river-editor-layout .river-outline-editor");

async function createTestNote(page: Page, title: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "+ 新建笔记" }).click();
  await editor(page).waitFor();
  const titleInput = page.locator(".river-editor-toolbar input");
  await titleInput.fill(title);
  await titleInput.press("Tab");
  const root = editor(page).locator(":scope > ul > li.river-outline-item > .river-outline-content > p").first();
  await root.click();
  await page.keyboard.press("End");
}

test("v0.22.1 library is borderless and removes the unused outer frame", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector("article.tmi-note");
  const frame = await page.evaluate(() => {
    const main = getComputedStyle(document.querySelector<HTMLElement>(".river-main-library")!);
    const panel = getComputedStyle(document.querySelector<HTMLElement>(".river-main-library > .tmi-panel")!);
    const window = getComputedStyle(document.querySelector<HTMLElement>(".river-main-library .tmi-window")!);
    return {
      mainPadding: main.padding,
      panelPadding: panel.padding,
      panelHeight: document.querySelector<HTMLElement>(".river-main-library > .tmi-panel")!.getBoundingClientRect().height,
      viewportHeight: innerHeight,
      pageHeight: document.documentElement.scrollHeight,
      borderWidth: window.borderWidth,
      borderRadius: window.borderRadius,
      boxShadow: window.boxShadow,
    };
  });
  expect(frame.mainPadding).toBe("0px");
  expect(frame.panelPadding).toBe("0px");
  expect(frame.panelHeight).toBeGreaterThan(frame.viewportHeight - 100);
  expect(frame.panelHeight).toBeLessThan(frame.viewportHeight);
  expect(frame.pageHeight).toBeLessThanOrEqual(frame.viewportHeight + 2);
  expect(frame.borderWidth).toBe("0px");
  expect(frame.borderRadius).toBe("0px");
  expect(frame.boxShadow).toBe("none");
});

test("Cmd+B button sits between H3 and ** and applies selection and single-line typing bold", async ({ page }) => {
  await createTestNote(page, `BOLD-${Date.now().toString(36)}`);
  await page.keyboard.press("Enter");
  await page.keyboard.type("普通文字");
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");

  const toolbarLabels = await page.locator(".river-outline-toolbar .river-chip").allTextContents();
  expect(toolbarLabels.slice(0, 6)).toEqual(["正文", "H1", "H2", "H3", "Cmd+B", "**"]);
  const boldButton = page.getByTestId("river-format-bold");
  await boldButton.click();
  await expect(editor(page).locator("strong").filter({ hasText: "普通" })).toHaveCount(1);

  await page.keyboard.press("End");
  await boldButton.click();
  await expect(boldButton).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.type("加粗输入");
  await expect(editor(page).locator("strong").filter({ hasText: "加粗输入" })).toHaveCount(1);

  await page.keyboard.press("Enter");
  await page.keyboard.type("新行普通");
  await expect(boldButton).toHaveAttribute("aria-pressed", "false");
  const lastParagraph = editor(page).locator(":scope > ul > li.river-outline-item").last().locator(":scope > .river-outline-content > p");
  await expect(lastParagraph).toHaveText("新行普通");
  await expect(lastParagraph.locator("strong")).toHaveCount(0);

  await page.keyboard.press("Meta+B");
  await expect(boldButton).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.type("快捷键加粗");
  await expect(lastParagraph.locator("strong").filter({ hasText: "快捷键加粗" })).toHaveCount(1);
  await page.keyboard.press("Enter");
  await page.keyboard.type("再来一行");
  const finalParagraph = editor(page).locator(":scope > ul > li.river-outline-item").last().locator(":scope > .river-outline-content > p");
  await expect(finalParagraph).toHaveText("再来一行");
  await expect(finalParagraph.locator("strong")).toHaveCount(0);

  await boldButton.click();
  await page.keyboard.type("临时加粗");
  await boldButton.click();
  await expect(boldButton).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.type("恢复普通");
  await expect(finalParagraph.locator("strong").filter({ hasText: "临时加粗" })).toHaveCount(1);
  await expect(finalParagraph).toContainText("恢复普通");
});
