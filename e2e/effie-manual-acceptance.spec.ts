import { expect, test, type Page } from "@playwright/test";

const editorRoot = (page: Page) => page.locator(".river-editor-layout .river-outline-editor");
const bodyItems = (page: Page) => page.locator(".river-editor-layout .river-outline-editor > ul > li.river-outline-item");

async function newNote(page: Page, title: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "+ 新建笔记" }).click();
  await editorRoot(page).waitFor();
  const input = page.locator(".river-editor-toolbar input");
  await input.fill(title);
  await input.press("Tab");
  const rootTitle = page.locator('.river-editor-layout .river-outline-item[data-item-type="knowledge"] > .river-outline-content > p').first();
  await rootTitle.click();
  await page.keyboard.press("End");
}

async function docTree(page: Page) {
  return page.evaluate(() => {
    const doc = (window as any).__riverEditor.getJSON();
    const text = (item: any) => (item.content || [])
      .filter((child: any) => child.type === "paragraph")
      .map((paragraph: any) => (paragraph.content || []).map((node: any) => node.text || "").join(""))
      .join("\n");
    const walk = (list: any): any[] => (list.content || []).map((item: any) => ({
      text: text(item),
      heading: Number(item.attrs?.headingLevel || 0),
      marker: item.attrs?.markerVisible !== false,
      children: (item.content || [])
        .filter((child: any) => child.type === "bulletList" || child.type === "orderedList")
        .flatMap(walk),
    }));
    return (doc.content || []).filter((node: any) => node.type === "bulletList" || node.type === "orderedList").flatMap(walk);
  });
}

async function caret(page: Page) {
  return page.evaluate(() => {
    const editor = (window as any).__riverEditor;
    const selection = editor.state.selection;
    return {
      from: selection.from,
      text: selection.$from.parent.textContent,
      offset: selection.$from.parentOffset,
    };
  });
}

test("Backspace removes text, the bullet, and then the empty line", async ({ page }) => {
  await newNote(page, "删除验收");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- ");
  await page.keyboard.type("知识点");
  const item = bodyItems(page).last();
  await expect(item).toHaveAttribute("data-marker-visible", "true");

  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await expect(item.locator(":scope > .river-outline-content > p")).toHaveText("");

  await page.keyboard.press("Backspace");
  await expect(item).toHaveAttribute("data-marker-visible", "false");
  await expect(item.locator(":scope > .river-outline-content > p")).toHaveText("");

  await page.keyboard.press("Backspace");
  await expect(bodyItems(page)).toHaveCount(1);
  await expect.poll(async () => (await caret(page)).text).toBe("删除验收");
  await expect.poll(async () => (await caret(page)).offset).toBe("删除验收".length);
});

test("Tab and Shift+Tab keep the caret inside the current item", async ({ page }) => {
  await newNote(page, "缩进验收");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- ");
  await page.keyboard.type("PARENT");
  await page.keyboard.press("Enter");
  await page.keyboard.type("CHILD1");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.type("CHILD2");
  await page.keyboard.press("Tab");
  await page.keyboard.type("TAIL");
  await expect.poll(async () => (await caret(page)).text).toBe("CHILD2TAIL");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.type("END");
  await expect.poll(async () => (await caret(page)).text).toBe("CHILD2TAILEND");
  const tree = await docTree(page);
  expect(JSON.stringify(tree)).toContain("CHILD2TAILEND");
});

test("Tab indents an empty sibling bullet and keeps the caret in it", async ({ page }) => {
  await newNote(page, "空小点缩进验收");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- ");
  await page.keyboard.type("PARENT");
  await page.keyboard.press("Enter");
  await page.keyboard.type("CHILD1");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Shift+Tab");
  await expect.poll(async () => (await caret(page)).text).toBe("");
  const emptyItem = page.locator('.river-editor-layout .river-outline-item[data-marker-visible="true"]').filter({ has: page.locator(':scope > .river-outline-content > p', { hasText: /^$/ }) }).last();
  const nodeId = await emptyItem.getAttribute("data-node-id");
  await emptyItem.locator(":scope > .river-outline-content > p").click();
  await page.keyboard.press("Tab");
  await expect(emptyItem).toHaveAttribute("data-node-id", nodeId || "");
  await page.keyboard.type("EMPTY-TAB");
  await expect.poll(async () => (await caret(page)).text).toBe("EMPTY-TAB");
});

test("hovering an outline row does not paint a dark block", async ({ page }) => {
  await newNote(page, "悬停验收");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- ");
  await page.keyboard.type("HOVER");
  const item = bodyItems(page).last();
  await item.hover();
  const background = await item.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(background === "rgba(0, 0, 0, 0)" || background === "transparent").toBe(true);
});

test("Delete also removes an empty bullet", async ({ page }) => {
  await newNote(page, "Delete验收");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- ");
  const item = bodyItems(page).last();
  await expect(item).toHaveAttribute("data-marker-visible", "true");
  await page.keyboard.press("Delete");
  await expect(item).toHaveAttribute("data-marker-visible", "false");
  await expect(item.locator(":scope > .river-outline-content > p")).toHaveText("");
});

test("- plus space restores a bullet in a nested plain row and after marker deletion", async ({ page }) => {
  await newNote(page, "短横线验收");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("- ");
  await page.keyboard.type("NESTED");
  let item = page.locator('.river-editor-layout .river-outline-item[data-marker-visible="true"]').last();
  await expect(item.locator(":scope > .river-outline-content > p")).toHaveText("NESTED");

  await page.keyboard.press("Enter");
  await page.keyboard.press("Backspace");
  await expect.poll(async () => (await caret(page)).text).toBe("");
  await page.keyboard.type("- ");
  await page.keyboard.type("AGAIN");
  item = page.locator('.river-editor-layout .river-outline-item[data-marker-visible="true"]').last();
  await expect(item.locator(":scope > .river-outline-content > p")).toHaveText("AGAIN");
});

test("- plus space converts an empty content block back into a bullet", async ({ page }) => {
  await newNote(page, "块转小点验收");
  await page.keyboard.press("Enter");
  await page.keyboard.type("> ");
  let item = bodyItems(page).last();
  await expect(item).toHaveAttribute("data-item-type", "block");
  await page.keyboard.type("- ");
  await page.keyboard.type("FROM-BLOCK");
  item = bodyItems(page).last();
  await expect(item).toHaveAttribute("data-item-type", "knowledge");
  await expect(item).toHaveAttribute("data-marker-visible", "true");
  await expect(item.locator(":scope > .river-outline-content > p")).toHaveText("FROM-BLOCK");
});

test("holding Delete does not cascade through multiple outline rows", async ({ page }) => {
  await newNote(page, "删除重复验收");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- ");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Enter");
  const before = await page.locator('.river-editor-layout .river-outline-item[data-item-type="knowledge"]').count();
  await page.keyboard.down("Delete");
  for (let index = 0; index < 12; index += 1) await page.keyboard.down("Delete");
  await page.keyboard.up("Delete");
  const after = await page.locator('.river-editor-layout .river-outline-item[data-item-type="knowledge"]').count();
  expect(after).toBeGreaterThanOrEqual(before - 1);
  expect(after).toBeLessThanOrEqual(before);
  for (let index = 0; index < 5; index += 1) await page.keyboard.press("Delete");
  const afterDiscrete = await page.locator('.river-editor-layout .river-outline-item[data-item-type="knowledge"]').count();
  expect(afterDiscrete).toBeLessThanOrEqual(after);
});

test("Enter on empty bullets outdents, removes the bullet, and then creates a plain line", async ({ page }) => {
  await newNote(page, "回车验收");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- ");
  await page.keyboard.type("今天");
  await page.keyboard.press("Enter");

  await expect.poll(async () => (await caret(page)).text).toBe("");
  let tree = await docTree(page);
  expect(tree.at(-1)?.text).toBe("");
  expect(tree.at(-1)?.marker).toBe(true);
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await caret(page)).text).toBe("");
  tree = await docTree(page);
  expect(tree.some((item: any) => item.text === "")).toBe(true);

  await page.keyboard.press("Enter");
  await expect.poll(async () => (await caret(page)).text).toBe("");
  const plainEmpty = page.locator('.river-editor-layout .river-outline-item[data-marker-visible="false"][data-heading="0"]').last();
  await expect(plainEmpty).toHaveAttribute("data-marker-visible", "false");

  await page.keyboard.press("Enter");
  await page.keyboard.type("PLAIN");
  await expect(plainEmpty).toHaveAttribute("data-marker-visible", "false");
  await expect.poll(async () => (await caret(page)).text).toBe("PLAIN");
});

test("heading, parenthesis pairing, plain text, bullet alignment and cancellation", async ({ page }) => {
  await newNote(page, "格式验收");
  await page.keyboard.press("Enter");
  await page.keyboard.type("### ");
  await page.keyboard.type("资产管理 (");
  await expect(page.locator(".river-editor-layout .river-outline-item[data-heading='3']").last().locator(":scope > .river-outline-content > p")).toHaveText("资产管理 ()");
  await page.keyboard.type("Asset Management");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- ");
  await page.keyboard.type("业务——购买债券");

  const heading = page.locator(".river-editor-layout .river-outline-item[data-heading='3']").last();
  const bullet = bodyItems(page).last();
  await expect(heading).toHaveAttribute("data-marker-visible", "false");
  await expect(bullet).toHaveAttribute("data-heading", "0");
  await expect(bullet).toHaveAttribute("data-marker-visible", "true");
  const headingColor = await heading.locator(":scope > .river-outline-content > p").evaluate((element) => getComputedStyle(element).color);
  const bodyColor = await bullet.locator(":scope > .river-outline-content > p").evaluate((element) => getComputedStyle(element).color);
  expect(headingColor).toBe("rgb(88, 152, 189)");
  expect(bodyColor).toBe("rgb(32, 33, 36)");
  const headingX = (await heading.locator(":scope > .river-outline-content > p").boundingBox())!.x;
  const bulletX = (await bullet.locator(":scope > .river-outline-content > p").boundingBox())!.x;
  expect(bulletX).toBeGreaterThan(headingX);

  await page.keyboard.press("Enter");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Enter");
  await expect(bodyItems(page).last()).toHaveAttribute("data-marker-visible", "false");
});

test("heading and bullet markers are mutually exclusive in both directions", async ({ page }) => {
  await newNote(page, "互斥验收");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- ");
  await page.keyboard.type("TEXT");
  let item = bodyItems(page).last();
  await expect(item).toHaveAttribute("data-marker-visible", "true");
  await page.keyboard.press("Home");
  await page.keyboard.type("# ");
  await expect(item).toHaveAttribute("data-heading", "1");
  await expect(item).toHaveAttribute("data-marker-visible", "false");

  await page.keyboard.press("Enter");
  await page.keyboard.type("- ");
  await page.keyboard.type("AGAIN");
  item = bodyItems(page).last();
  await expect(item).toHaveAttribute("data-heading", "0");
  await expect(item).toHaveAttribute("data-marker-visible", "true");
});

test("slash opens anywhere, keeps the slash, shows the Effie panel and submenu", async ({ page }) => {
  await newNote(page, "斜杠验收");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Per");
  await page.keyboard.type("/");
  await page.keyboard.type("sonal");

  const item = bodyItems(page).last();
  await expect(item.locator(":scope > .river-outline-content > p")).toHaveText("Per/sonal");
  const menu = page.locator(".river-slash-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByTestId("river-slash-effie-ai")).toBeVisible();
  await expect(menu.getByTestId("river-slash-h1")).toBeVisible();
  await expect(menu.getByTestId("river-slash-h4")).toBeVisible();
  await expect(menu.getByTestId("river-slash-bullet")).toBeVisible();
  await expect(menu.getByTestId("river-slash-ordered")).toBeVisible();
  await expect(menu.getByTestId("river-slash-bold")).toBeVisible();
  await expect(menu.getByTestId("river-slash-marker")).toBeVisible();
  await expect(menu.getByTestId("river-slash-code")).toBeVisible();
  await expect(menu.getByTestId("river-slash-image")).toBeVisible();
  await expect(menu.getByTestId("river-slash-link")).toBeVisible();
  await expect(menu.getByTestId("river-slash-table")).toBeVisible();
  await expect(menu.getByTestId("river-slash-datetime")).toBeVisible();

  await menu.getByTestId("river-slash-effie-ai").hover();
  const submenu = menu.locator(".river-slash-submenu");
  await expect(submenu).toBeVisible();
  await expect(submenu).toContainText("优化改写");
  await expect(submenu).toContainText("调整风格");
  await expect(submenu).toContainText("AI点评");

  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(item.locator(":scope > .river-outline-content > p")).toHaveText("Per/sonal");
});

test("slash menu keyboard navigation and command execution work", async ({ page }) => {
  await newNote(page, "斜杠命令验收");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/");
  const menu = page.locator(".river-slash-menu");
  await expect(menu).toBeVisible();

  await page.keyboard.press("ArrowDown");
  await expect(menu.getByTestId("river-slash-effie-ai")).toHaveClass(/is-active/);
  await expect(menu.locator(".river-slash-submenu")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await expect(menu.locator(".river-slash-subitem.is-active")).toContainText("调整风格");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);

  await page.keyboard.press("Enter");
  await page.keyboard.type("/");
  await expect(menu).toBeVisible();
  await menu.getByTestId("river-slash-h3").click();
  await page.keyboard.type("资产管理");
  const heading = page.locator('.river-editor-layout .river-outline-item[data-heading="3"]').last();
  await expect(heading).toHaveAttribute("data-marker-visible", "false");
  await expect(heading.locator(":scope > .river-outline-content > p")).toHaveText("资产管理");
});

test("heading and bullet semantics survive save and reopen", async ({ page }) => {
  const title = "持久化语义验收";
  await newNote(page, title);
  await page.keyboard.press("Enter");
  await page.keyboard.type("### ");
  await page.keyboard.type("标题");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- ");
  await page.keyboard.type("小点");
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "返回笔记库" }).click();
  const card = page.locator("article.tmi-note").filter({ hasText: title });
  await expect(card).toHaveCount(1);
  await card.getByRole("button", { name: "打开" }).click();
  await editorRoot(page).waitFor();
  const heading = page.locator('.river-editor-layout .river-outline-item[data-heading="3"]').last();
  const bullet = page.locator('.river-editor-layout .river-outline-item[data-marker-visible="true"][data-heading="0"]').last();
  await expect(heading).toHaveAttribute("data-marker-visible", "false");
  await expect(heading.locator(":scope > .river-outline-content > p")).toHaveText("标题");
  await expect(bullet.locator(":scope > .river-outline-content > p")).toHaveText("小点");
});
