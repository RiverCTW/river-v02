import { expect, test } from "@playwright/test";

test("v0.2 keeps main knowledge tree and two learning maps independent", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "+ 新建笔记" }).click();
  await page.locator(".river-editor-layout .river-outline-editor").waitFor();
  const title = `V02-DUAL-${Date.now()}`;
  await page.locator(".river-editor-toolbar input").fill(title);
  await page.locator(".river-editor-toolbar input").press("Tab");
  await page.waitForTimeout(500);

  const noteId = await page.evaluate(async (wanted) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("river-v0.1");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const note = await new Promise<any>((resolve, reject) => {
      const request = db.transaction("notes").objectStore("notes").getAll();
      request.onsuccess = () => resolve((request.result as any[]).find((item) => item.title === wanted));
      request.onerror = () => reject(request.error);
    });
    if (!note) throw new Error("note not found");
    const now = new Date().toISOString();
    const nodes = [
      { id: `map-a-${note.id}`, noteId: note.id, parentId: null, order: 0, title: "Q1 核心问题", nodeType: "knowledge", collapsed: false, sourceRefs: [], userModified: false, createdAt: now, updatedAt: now },
      { id: `map-b-${note.id}`, noteId: note.id, parentId: null, order: 0, title: "R1 学习要求", nodeType: "knowledge", collapsed: false, sourceRefs: [], userModified: false, createdAt: now, updatedAt: now },
    ];
    const blocks = [
      { id: `map-ab-${note.id}`, noteId: note.id, nodeId: `map-a-${note.id}`, order: 0, type: "explanation", text: "问题说明", sourceRefs: [], userModified: false, createdAt: now, updatedAt: now },
      { id: `map-bb-${note.id}`, noteId: note.id, nodeId: `map-b-${note.id}`, order: 0, type: "explanation", text: "要求说明", sourceRefs: [], userModified: false, createdAt: now, updatedAt: now },
    ];
    const doc = note.editorDoc;
    const tx = db.transaction(["notes", "learningMaps"], "readwrite");
    tx.objectStore("notes").put({ ...note, generationState: "completed", sourcesLockedAt: now, profileLockedAt: now, generatedAt: now });
    tx.objectStore("learningMaps").put({ noteId: note.id, kind: "questions", editorDoc: doc, nodes: [nodes[0]], blocks: [blocks[0]], syncEnabled: false, revision: 1, createdAt: now, updatedAt: now });
    tx.objectStore("learningMaps").put({ noteId: note.id, kind: "requirements", editorDoc: doc, nodes: [nodes[1]], blocks: [blocks[1]], syncEnabled: false, revision: 1, createdAt: now, updatedAt: now });
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    db.close();
    return note.id;
  }, title);

  await page.reload({ waitUntil: "networkidle" });
  await page.locator("article.tmi-note").filter({ hasText: title }).getByRole("button", { name: "打开" }).click();
  await page.locator(".river-learning-map-instance.is-active .river-outline-editor").waitFor();
  await expect(page.locator(".river-learning-map-instance")).toHaveCount(2);

  const main = page.locator(".river-v02-note-main .river-outline-editor");
  const requirements = page.locator(".river-learning-map-instance.is-active .river-outline-editor");
  await main.click();
  await main.press("End");
  await main.pressSequentially("-MAIN-ONLY");
  await requirements.click();
  await requirements.press("End");
  await requirements.pressSequentially("-REQ-ONLY");
  await page.waitForTimeout(500);
  await expect(main).toContainText("MAIN-ONLY");
  await expect(requirements).toContainText("REQ-ONLY");

  await page.getByRole("tab", { name: /问题式学习地图/ }).click();
  const questions = page.locator(".river-learning-map-instance.is-active .river-outline-editor");
  await questions.click();
  await questions.press("End");
  await questions.pressSequentially("-ANSWER-ONE");
  await page.getByRole("tab", { name: /学习目标式学习地图/ }).click();
  await expect(requirements).toContainText("REQ-ONLY");
  await page.getByRole("tab", { name: /问题式学习地图/ }).click();
  await expect(questions).toContainText("ANSWER-ONE");
  expect(noteId).toBeTruthy();
});

test("v0.2 exposes persistent resizable panes and read-only chat shell", async ({ page }) => {
  await page.goto("/");
  await page.locator("article.tmi-note").first().getByRole("button", { name: "打开" }).click();
  await page.locator(".river-v02-note-layout").waitFor();
  const horizontal = page.locator(".river-resizable-split.is-horizontal > .river-split-divider");
  const before = await page.locator(".river-v02-note-layout").evaluate((element) => getComputedStyle(element.querySelector(".river-resizable-split")!).gridTemplateColumns);
  await horizontal.dblclick();
  const after = await page.locator(".river-v02-note-layout").evaluate((element) => getComputedStyle(element.querySelector(".river-resizable-split")!).gridTemplateColumns);
  expect(after).toBeTruthy();
  expect(before).toBeTruthy();
  await expect(page.locator(".river-chat-panel")).toContainText("AI 只回答，不改笔记");
  await expect(page.locator(".river-learning-map-editors")).toBeVisible();
});
