import { expect, test, type Page } from "@playwright/test";

const editorRoot = (page: Page) => page.locator(".river-editor-layout .river-outline-editor").first();
const targetItem = (page: Page, text = "TARGET") => page.locator(".river-outline-item").filter({ hasText: text }).last();
const menu = (page: Page) => page.getByTestId("river-slash-menu");

let serial = 0;
const nextTitle = (label: string) => `${label}-${Date.now()}-${serial++}`;

async function newLine(page: Page, label: string, text = "TARGET") {
  await page.goto("/");
  await page.getByRole("button", { name: "+ 新建笔记" }).click();
  await editorRoot(page).waitFor();
  const title = page.locator(".river-editor-toolbar input").first();
  await title.fill(nextTitle(label));
  await title.press("Tab");
  const root = page.locator('.river-editor-layout .river-outline-item[data-item-type="knowledge"] > .river-outline-content > p').first();
  await root.click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type(text);
  await expect(targetItem(page, text)).toBeVisible();
  return targetItem(page, text);
}

async function openMenu(page: Page) {
  await page.keyboard.type("/");
  await expect(menu(page)).toBeVisible();
  return menu(page);
}

async function choose(page: Page, id: string) {
  await menu(page).getByTestId(`river-slash-${id}`).click();
  await page.waitForTimeout(100);
}

test("v25 headings and lists update real outline structure", async ({ page }) => {
  for (const level of [1, 2, 3, 4]) {
    await newLine(page, `标题${level}`);
    await openMenu(page);
    await choose(page, `h${level}`);
    const item = targetItem(page);
    await expect(item).toHaveAttribute("data-heading", String(level));
    await expect(item).toHaveAttribute("data-marker-visible", "false");
    await page.keyboard.type(`H${level}`);
    await expect(item.locator(":scope > .river-outline-content > p")).toContainText(`TARGETH${level}`);
  }

  for (const [id, tag] of [["bullet", "UL"], ["ordered", "OL"]] as const) {
    await newLine(page, id);
    await openMenu(page);
    await choose(page, id);
    const item = targetItem(page);
    await expect(item).toHaveAttribute("data-marker-visible", "true");
    await expect(item).toHaveAttribute("data-heading", "0");
    await expect(item.evaluate((element) => element.parentElement?.tagName)).resolves.toBe(tag);
  }
});

test("v25 inline marker commands work with and without a selection", async ({ page }) => {
  const cases = [
    ["bold", "**", "river-semantic-pink"],
    ["italic", "*", "river-semantic-gold"],
    ["strike", "~~", "river-semantic-strike"],
    ["marker", "::", "river-semantic-annotation"],
    ["comment", "++", "river-semantic-comment"],
    ["code", "`", "river-semantic-code"],
  ] as const;

  for (const [id, marker, className] of cases) {
    await newLine(page, `${id}-caret`);
    await openMenu(page);
    await choose(page, id);
    await page.keyboard.type("X");
    const item = targetItem(page);
    await expect(item.locator(":scope > .river-outline-content > p")).toContainText(`TARGET${marker}X${marker}`);
    await expect(item.locator(`.${className}`)).toHaveCount(1);
    await page.keyboard.press("Meta+z");
    await expect(item.locator(":scope > .river-outline-content > p")).toHaveText(`TARGET${marker}${marker}`);
    await page.keyboard.press("Meta+z");
    await expect(item.locator(":scope > .river-outline-content > p")).toHaveText("TARGET/");
    await page.keyboard.press("Meta+Shift+z");
    await expect(item.locator(":scope > .river-outline-content > p")).toHaveText(`TARGET${marker}${marker}`);
    await page.keyboard.press("Meta+Shift+z");
    await expect(item.locator(":scope > .river-outline-content > p")).toHaveText(`TARGET${marker}X${marker}`);
    await expect(item.locator(`.${className}`)).toHaveCount(1);
  }

  for (const [id, marker, className] of cases) {
    await newLine(page, `${id}-selection`);
    await openMenu(page);
    await page.keyboard.press("Home");
    await page.keyboard.down("Shift");
    await page.keyboard.press("End");
    await page.keyboard.up("Shift");
    await choose(page, id);
    const item = targetItem(page);
    await expect(item.locator(":scope > .river-outline-content > p")).toHaveText(`${marker}TARGET${marker}`);
    await expect(item.locator(`.${className}`)).toHaveCount(1);
  }
});

test("v25 block commands create real blocks and remain editable", async ({ page }) => {
  for (const [id, blockType] of [
    ["quote", "quote"],
    ["comment-block", "comment"],
    ["code-block", "code"],
    ["divider", "divider"],
  ] as const) {
    await newLine(page, id);
    await openMenu(page);
    await choose(page, id);
    const item = targetItem(page);
    await expect(item).toHaveAttribute("data-item-type", "block");
    await expect(item).toHaveAttribute("data-block-type", blockType);
    await page.keyboard.type("NEXT");
    await expect(item.locator(":scope > .river-outline-content > p")).toContainText("NEXT");
  }

  await newLine(page, "escape");
  await openMenu(page);
  await choose(page, "escape");
  await expect(targetItem(page).locator(":scope > .river-outline-content > p")).toHaveText("TARGET\\");
});


test("v25 format and block actions persist through save and reopen", async ({ page }) => {
  const headingCases = [1, 2, 3, 4].map((level) => ({
    id: `h${level}`,
    marker: "",
    className: "",
    expected: `SAVE_h${level}`,
    assert: async (item: ReturnType<typeof targetItem>) => {
      await expect(item).toHaveAttribute("data-heading", String(level));
    },
  }));
  const listCases = [["bullet", "UL"], ["ordered", "OL"]].map(([id, tag]) => ({
    id,
    marker: "",
    className: "",
    expected: `SAVE_${id}`,
    assert: async (item: ReturnType<typeof targetItem>) => {
      await expect(item).toHaveAttribute("data-marker-visible", "true");
      await expect(item.evaluate((element) => element.parentElement?.tagName)).resolves.toBe(tag);
    },
  }));
  const inlineCases = [
    ["bold", "**", "river-semantic-pink"],
    ["italic", "*", "river-semantic-gold"],
    ["strike", "~~", "river-semantic-strike"],
    ["marker", "::", "river-semantic-annotation"],
    ["comment", "++", "river-semantic-comment"],
    ["code", "`", "river-semantic-code"],
  ].map(([id, marker, className]) => ({
    id,
    marker,
    className,
    expected: `SAVE_${id}${marker}X${marker}`,
    assert: async (item: ReturnType<typeof targetItem>) => {
      await expect(item.locator(`.${className}`)).toHaveCount(1);
    },
  }));
  const blockCases = [
    ["quote", "quote"],
    ["comment-block", "comment"],
    ["code-block", "code"],
    ["divider", "divider"],
  ].map(([id, blockType]) => ({
    id,
    marker: "",
    className: "",
    expected: `SAVE_${id}`,
    assert: async (item: ReturnType<typeof targetItem>) => {
      await expect(item).toHaveAttribute("data-block-type", blockType);
      await expect(item).toHaveAttribute("data-item-type", "block");
    },
  }));
  const cases = [
    ...headingCases,
    ...listCases,
    ...inlineCases,
    ...blockCases,
    {
      id: "escape",
      marker: "",
      className: "",
      expected: "SAVE_escape\\",
      assert: async (item: ReturnType<typeof targetItem>) => {
        await expect(item.locator(":scope > .river-outline-content > p")).toContainText("\\");
      },
    },
  ];

  for (const entry of cases) {
    await newLine(page, entry.id, `SAVE_${entry.id}`);
    await openMenu(page);
    await choose(page, entry.id);
    if (entry.marker) await page.keyboard.type("X");
    await page.waitForTimeout(650);
    const title = await page.locator(".river-editor-toolbar input").first().inputValue();
    await page.getByRole("button", { name: "返回笔记库" }).click();
    await page.reload();
    const card = page.locator("article.tmi-note").filter({ hasText: title }).first();
    await card.getByRole("button", { name: "打开" }).click();
    await expect(editorRoot(page)).toBeVisible();
    const saved = page.locator(".river-outline-item").filter({ hasText: entry.expected }).last();
    await expect(saved).toBeVisible();
    await entry.assert(saved);
  }
});

test("v25 image insertion, cancel and persistence use the real image node", async ({ page }) => {
  const buffer = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAI0lEQVR4nGP8//9/dO9JBjBgiu49ubTYHMphYGCA80EcOB8AlscNtkNY5NoAAAAASUVORK5CYII=", "base64");

  await newLine(page, "图片取消");
  await openMenu(page);
  const cancelled = page.waitForEvent("filechooser");
  await menu(page).getByTestId("river-slash-image").click();
  await (await cancelled).setFiles([]);
  await expect(page.locator(".river-image-node")).toHaveCount(0);

  await newLine(page, "图片持久化");
  await openMenu(page);
  const chooser = page.waitForEvent("filechooser");
  await menu(page).getByTestId("river-slash-image").click();
  await (await chooser).setFiles({ name: "river.png", mimeType: "image/png", buffer });
  const image = page.locator(".river-image-node").first();
  await expect(image).toBeVisible();
  await expect(image.locator("img")).toHaveAttribute("src", /^data:image\//);
  await page.keyboard.press("Meta+z");
  await expect(page.locator(".river-image-node")).toHaveCount(0);
  await page.keyboard.press("Meta+Shift+z");
  await expect(page.locator(".river-image-node")).toHaveCount(1);
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "返回笔记库" }).click();
  await page.reload();
  const card = page.locator("article.tmi-note").filter({ hasText: "图片持久化" }).first();
  await card.getByRole("button", { name: "打开" }).click();
  await expect(page.locator(".river-editor-layout .river-image-node")).toHaveCount(1);
});

test("v25 link insertion supports caret and selection and survives reopen", async ({ page }) => {
  await newLine(page, "链接光标");
  await openMenu(page);
  page.once("dialog", async (dialog) => dialog.accept("https://example.com"));
  await choose(page, "link");
  const anchor = page.locator(".river-editor-layout a[href='https://example.com']").first();
  await expect(anchor).toContainText("https://example.com");
  await expect(anchor).toHaveAttribute("target", "_blank");
  await page.keyboard.press("Meta+z");
  await expect(page.locator(".river-editor-layout a[href='https://example.com']")).toHaveCount(0);
  await page.keyboard.press("Meta+Shift+z");
  await expect(page.locator(".river-editor-layout a[href='https://example.com']")).toHaveCount(1);

  await newLine(page, "链接选区");
  await openMenu(page);
  await page.keyboard.press("Home");
  await page.keyboard.down("Shift");
  await page.keyboard.press("End");
  await page.keyboard.up("Shift");
  page.once("dialog", async (dialog) => dialog.accept("example.org"));
  await choose(page, "link");
  await expect(page.locator(".river-editor-layout a[href='https://example.org']")).toContainText("TARGET");

  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "返回笔记库" }).click();
  await page.reload();
  const card = page.locator("article.tmi-note").filter({ hasText: "链接选区" }).first();
  await card.getByRole("button", { name: "打开" }).click();
  await expect(page.locator(".river-editor-layout a[href='https://example.org']")).toContainText("TARGET");
});

test("v25 deferred table and date entries stay honest", async ({ page }) => {
  await newLine(page, "表格暂缓");
  await openMenu(page);
  await choose(page, "table");
  await expect(page.locator(".river-outline-editor table")).toHaveCount(0);
  await expect(page.locator(".river-toast")).toContainText("尚未接入");

  await newLine(page, "日期已有");
  await openMenu(page);
  await choose(page, "datetime");
  await expect(targetItem(page).locator(":scope > .river-outline-content > p")).toContainText(/\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}/);
});

test("v25 menu is available in the companion learning-map editor", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "+ 新建笔记" }).click();
  await editorRoot(page).waitFor();
  const title = nextTitle("伴随栏菜单");
  await page.locator(".river-editor-toolbar input").first().fill(title);
  await page.locator(".river-editor-toolbar input").first().press("Tab");
  const noteId = await page.evaluate(async () => {
    const store = await import("/src/store/useAppStore.ts");
    return store.useAppStore.getState().bundle?.note.id;
  });
  expect(noteId).toBeTruthy();
  await page.evaluate(async (id) => {
    const dbModule = await import("/src/db/database.ts");
    const convert = await import("/src/editor/convert.ts");
    const now = new Date().toISOString();
    await dbModule.db.learningMaps.put({
      noteId: id,
      kind: "requirements",
      editorDoc: convert.emptyOutlineDocument("学习目标式学习地图"),
      nodes: [],
      blocks: [],
      syncEnabled: true,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    });
  }, noteId);
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("article.tmi-note").filter({ hasText: title }).first().getByRole("button", { name: "打开" }).click();
  const mapEditor = page.locator(".river-learning-map-instance.is-active .river-outline-editor").first();
  await expect(mapEditor).toBeVisible();
  await mapEditor.locator("p").first().click();
  await page.keyboard.press("End");
  await page.keyboard.type("MAP_TARGET");
  await page.keyboard.type("/");
  await expect(menu(page)).toBeVisible();
  await expect(menu(page).locator("[data-item-id]")).toHaveCount(21);
  await choose(page, "h2");
  await expect(mapEditor.locator('.river-outline-item[data-heading="2"]')).toHaveCount(1);
  await expect(mapEditor).toContainText("MAP_TARGET");
});
