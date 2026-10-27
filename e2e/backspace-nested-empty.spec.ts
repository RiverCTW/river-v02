import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1920, height: 1080 } });

test("Backspace in a nested empty block keeps the caret in the parent block", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "+ 新建笔记" }).click();
  await expect(page.locator(".river-outline-editor").first()).toBeVisible();
  await page.waitForTimeout(600);

  const doc = {
    type: "doc",
    content: [{ type: "bulletList", content: [{
      type: "listItem",
      attrs: { itemType: "knowledge", nodeId: "n1", nodeType: "chapter", headingLevel: 2, markerVisible: false, collapsed: false },
      content: [
        { type: "paragraph", content: [{ type: "text", text: "资产项" }] },
        { type: "bulletList", content: [
          { type: "listItem", attrs: { itemType: "block", blockId: "b1", blockType: "explanation", headingLevel: 0, markerVisible: false, collapsed: false }, content: [{ type: "paragraph", content: [{ type: "text", text: "资产是银行资金运用，代表银行持有的现金、证券、贷款和其他权利。" }] }] },
          { type: "listItem", attrs: { itemType: "knowledge", nodeId: "n2", nodeType: "knowledge", headingLevel: 3, markerVisible: false, collapsed: false }, content: [
            { type: "paragraph", content: [{ type: "text", text: "准备金" }] },
            { type: "bulletList", content: [
              { type: "listItem", attrs: { itemType: "block", blockId: "b2", blockType: "definition", headingLevel: 0, markerVisible: false, collapsed: false }, content: [
                { type: "paragraph", content: [{ type: "text", text: "准备金包括库存现金和存放在美联储的存款。" }] },
                { type: "bulletList", content: [
                  { type: "listItem", attrs: { itemType: "block", blockId: "b3", blockType: "definition", headingLevel: 0, markerVisible: false, collapsed: false }, content: [{ type: "paragraph" }] }
                ] }
              ] }
            ] }
          ] }
        ] }
      ]
    }] }]
  };
  await page.evaluate((json) => (window as any).__riverEditor.commands.setContent(json), doc);
  await page.locator('[data-block-id="b3"] p').click();
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(300);

  const result = await page.evaluate(() => {
    const editor = (window as any).__riverEditor;
    let exists = false;
    editor.state.doc.descendants((node: any) => { if (node.attrs?.blockId === "b3") exists = true; });
    const from = editor.state.selection.from;
    return { exists, before: editor.state.doc.textBetween(Math.max(0, from - 8), from, "") };
  });
  expect(result.exists).toBe(false);
  expect(result.before).toContain("存款。");
  expect(result.before).not.toContain("权利。");
});
