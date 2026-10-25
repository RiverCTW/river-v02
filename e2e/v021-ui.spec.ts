import { expect, test, type Page } from "@playwright/test";

async function openIndependentNote(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "独立笔记页" }).click();
  await page.waitForSelector(".river-v02-note-layout");
}

test("V021-RESPONSIVE: desktop sizes have no horizontal overflow and keep the format toolbar visible", async ({ page }) => {
  const sizes = [[1920, 1080], [1600, 900], [1440, 900], [1366, 768], [1280, 800], [1024, 768]];
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await openIndependentNote(page);
    const result = await page.evaluate(() => {
      const toolbar = document.querySelector<HTMLElement>(".river-main-editor-region .river-outline-toolbar");
      const rect = toolbar?.getBoundingClientRect();
      return {
        overflowX: document.documentElement.scrollWidth > innerWidth,
        toolbarVisible: Boolean(rect && rect.width > 0 && rect.top >= 0 && rect.bottom <= innerHeight),
      };
    });
    expect(result.overflowX, `${width}x${height} horizontal overflow`).toBe(false);
    expect(result.toolbarVisible, `${width}x${height} toolbar visibility`).toBe(true);
  }
});

test("V021-UI: chat text sizes and the note-card move dialog are usable", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openIndependentNote(page);
  const chatSizes = await page.evaluate(() => ({
    message: getComputedStyle(document.body).fontSize,
    input: getComputedStyle(document.querySelector<HTMLTextAreaElement>(".river-chat-compose textarea")!).fontSize,
    modes: getComputedStyle(document.querySelector<HTMLElement>(".river-chat-modes .river-chip")!).fontSize,
  }));
  expect(chatSizes.input).toBe("15px");
  expect(chatSizes.modes).toBe("13px");

  await page.goto("/");
  await page.waitForSelector("article.effie-note-card");
  const card = page.locator("article.effie-note-card").first();
  await card.click({ button: "right" });
  await page.getByRole("menuitem", { name: "移动到…" }).click();
  const dialog = page.getByRole("dialog", { name: /移动/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("combobox")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "确认移动" })).toBeVisible();
});

test("V021-GENERATION: personalization is sent to the durable job and the note unlocks after failure", async ({ page }) => {
  let requestBody: any = null;
  let pollCount = 0;
  await page.route("**/api/ai/full-package", async (route) => {
    if (route.request().method() === "POST") {
      requestBody = route.request().postDataJSON();
      await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({
        jobId: "job-e2e-v021", noteId: requestBody.noteId, status: "QUEUED", stage: "queued", progress: 1,
        message: "等待后台任务开始", currentFile: null, pageRange: null, sectionTitle: null,
        completedSections: 0, totalSections: 0, totalPages: 1, provider: "deepseek", model: "deepseek-v4.1-flash",
        errorCode: null, errorMessage: null, retryCount: 0, requestedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), finishedAt: null,
      }) });
    }
  });
  await page.route("**/api/ai/full-package/*", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith("/active")) {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: { message: "none" } }) });
      return;
    }
    pollCount += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      jobId: "job-e2e-v021", noteId: requestBody?.noteId, status: "FAILED", stage: "FAILED", progress: 0,
      message: "生成失败", currentFile: null, pageRange: null, sectionTitle: null,
      completedSections: 0, totalSections: 0, totalPages: 1, provider: "deepseek", model: "deepseek-v4.1-flash",
      errorCode: "invalid_api_key", errorMessage: "测试构造的模型认证失败", retryCount: 0,
      requestedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
    }) });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "+ 新建笔记" }).click();
  await expect(page.locator(".river-v02-note-layout")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "设置 / API Key" }).click();
  await page.getByRole("button", { name: "卡扣 AI — DeepSeek V4.1 Flash" }).click();
  await page.locator("#river-ai-key").fill("sk-e2e-test");
  await page.getByRole("button", { name: "保存设置" }).click();
  await page.locator('.river-companion-panel input[type="file"]').setInputFiles("tests/fixtures/chinese-english.pdf");
  await expect(page.locator(".river-source-item")).toHaveCount(1, { timeout: 15_000 });
  await page.getByRole("button", { name: "最粗略地了解涉及什么" }).click();
  await page.getByRole("button", { name: "完全零基础" }).click();
  await page.getByRole("button", { name: "好奇或一般了解" }).click();
  await page.getByPlaceholder("请输入您的个性化需求，如：生成中文笔记，保留课件的英文术语对照。").fill("保留英文术语对照");
  await page.getByRole("button", { name: "生成知识树" }).click();
  await expect.poll(() => requestBody?.customization).toBe("保留英文术语对照");
  expect(requestBody.totalPages).toBeGreaterThan(0);
  expect(requestBody.noteId).toBeTruthy();
  await expect.poll(() => pollCount).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "生成知识树" })).toBeVisible({ timeout: 10_000 });
});
