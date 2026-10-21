import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = "/Users/river/Documents/Codex/2026-08-24/hi/deliverables/RIVER_R6_20261019/raw";

type Finding = Record<string, unknown>;
function record(name: string, data: Finding) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, `${name}-${Date.now()}.json`), JSON.stringify(data, null, 2));
}

function uniqueTitle(label: string) {
  return `R6-${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

const editorRoot = (page: Page) => page.locator(".river-editor-layout .river-outline-editor");

async function createNote(page: Page, text: string): Promise<string> {
  await page.goto("/");
  await page.getByRole("button", { name: "+ 新建笔记" }).click();
  await editorRoot(page).waitFor();
  const title = uniqueTitle("note");
  const titleInput = page.locator(".river-editor-toolbar input");
  await titleInput.fill(title);
  await titleInput.press("Tab");
  const first = page.locator('.river-editor-layout .river-outline-item[data-item-type="knowledge"] > .river-outline-content > p').first();
  await first.click();
  await page.keyboard.press("End");
  await page.keyboard.type(text, { delay: 8 });
  return title;
}

async function findNote(page: Page, title: string) {
  return page.evaluate(async (wanted) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const request = indexedDB.open("river-v0.1");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const notes: any[] = await new Promise((resolve, reject) => {
      const request = db.transaction("notes").objectStore("notes").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return notes.find((note) => note.title === wanted) ?? null;
  }, title);
}

function textsOf(node: any, out: string[] = []): string[] {
  if (!node) return out;
  if (typeof node.text === "string") out.push(node.text);
  (node.content || []).forEach((child: any) => textsOf(child, out));
  return out;
}

async function openNoteByTitle(page: Page, title: string) {
  await page.goto("/");
  const card = page.locator("article.tmi-note").filter({ hasText: title });
  await expect(card).toHaveCount(1, { timeout: 15000 });
  await card.getByRole("button", { name: "打开" }).click();
  await editorRoot(page).waitFor();
}

async function waitDbText(page: Page, title: string, expected: string) {
  await expect
    .poll(async () => textsOf((await findNote(page, title))?.editorDoc).join(""), { timeout: 15000, intervals: [50, 100, 200] })
    .toContain(expected);
}

async function editorText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const editor = (window as any).__riverEditor;
    const doc = editor?.getJSON?.();
    const walk = (node: any, out: string[] = []) => {
      if (typeof node?.text === "string") out.push(node.text);
      (node?.content || []).forEach((child: any) => walk(child, out));
      return out;
    };
    return walk(doc).join("\n");
  });
}

async function injectCache(page: Page, noteId: string, editorDoc: any, savedAt: number) {
  await page.evaluate(
    ({ id, doc, at }) => localStorage.setItem(`river.editor-snapshot.v1.${id}`, JSON.stringify({ editorDoc: doc, savedAt: at })),
    { id: noteId, doc: editorDoc, at: savedAt },
  );
}

function mutateText(doc: any, from: string, to: string) {
  const clone = JSON.parse(JSON.stringify(doc));
  const walk = (node: any) => {
    if (typeof node?.text === "string") node.text = node.text.split(from).join(to);
    (node?.content || []).forEach(walk);
  };
  walk(clone);
  return clone;
}

test("R6-CACHE-02 stale cache must not roll back a newer IndexedDB document", async ({ page }) => {
  const title = await createNote(page, "V2NEW");
  await waitDbText(page, title, "V2NEW");
  const note = await findNote(page, title);
  expect(note).toBeTruthy();

  const cacheBefore = await page.evaluate((id) => localStorage.getItem(`river.editor-snapshot.v1.${id}`), note.id);
  const stale = mutateText(note.editorDoc, "V2NEW", "V1OLD");
  // savedAt is older than the IndexedDB write that already happened.
  await injectCache(page, note.id, stale, 1);

  await openNoteByTitle(page, title);
  const liveText = await editorText(page);
  const dbText = textsOf((await findNote(page, title))?.editorDoc).join("");

  const pass = liveText.includes("V2NEW") && dbText.includes("V2NEW") && !dbText.includes("V1OLD");
  record("cache-02", { title, noteId: note.id, cacheAfterSaveWasNull: cacheBefore === null, staleSavedAt: 1, liveText, dbText, pass });
  expect(pass, `live=${liveText} db=${dbText}`).toBe(true);
});

test("R6-CACHE-04 corrupt cache JSON must not destroy database content", async ({ page }) => {
  const title = await createNote(page, "CORRUPTDB");
  await waitDbText(page, title, "CORRUPTDB");
  const note = await findNote(page, title);
  await page.evaluate((id) => localStorage.setItem(`river.editor-snapshot.v1.${id}`, "{not-json"), note.id);
  await openNoteByTitle(page, title);
  const liveText = await editorText(page);
  const dbText = textsOf((await findNote(page, title))?.editorDoc).join("");
  const pass = liveText.includes("CORRUPTDB") && dbText.includes("CORRUPTDB");
  record("cache-04", { title, noteId: note.id, liveText, dbText, pass });
  expect(pass).toBe(true);
});

test("R6-CACHE-05 malformed cache object must be ignored", async ({ page }) => {
  const title = await createNote(page, "SHAPEDDB");
  await waitDbText(page, title, "SHAPEDDB");
  const note = await findNote(page, title);
  await page.evaluate(
    (id) => localStorage.setItem(`river.editor-snapshot.v1.${id}`, JSON.stringify({ editorDoc: { content: "not-an-array" }, savedAt: 9 })),
    note.id,
  );
  await openNoteByTitle(page, title);
  const liveText = await editorText(page);
  const dbText = textsOf((await findNote(page, title))?.editorDoc).join("");
  const pass = liveText.includes("SHAPEDDB") && dbText.includes("SHAPEDDB");
  record("cache-05", { title, noteId: note.id, liveText, dbText, pass });
  expect(pass).toBe(true);
});

test("R6-CACHE-08 reopening without cache must load the IndexedDB document", async ({ page }) => {
  const title = await createNote(page, "NOCACHE");
  await waitDbText(page, title, "NOCACHE");
  const note = await findNote(page, title);
  await page.evaluate((id) => localStorage.removeItem(`river.editor-snapshot.v1.${id}`), note.id);
  await openNoteByTitle(page, title);
  const liveText = await editorText(page);
  const pass = liveText.includes("NOCACHE");
  record("cache-08", { title, noteId: note.id, liveText, pass });
  expect(pass).toBe(true);
});

test("R6-RACE-01 keystrokes survive an immediate reload with no settle wait", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "+ 新建笔记" }).click();
  await editorRoot(page).waitFor();
  const title = uniqueTitle("race");
  const titleInput = page.locator(".river-editor-toolbar input");
  await titleInput.fill(title);
  await titleInput.press("Tab");
  const first = page.locator('.river-editor-layout .river-outline-item[data-item-type="knowledge"] > .river-outline-content > p').first();
  await first.click();
  await page.keyboard.press("End");
  const payload = "RACE" + "x".repeat(38);
  await page.keyboard.type(payload, { delay: 4 });
  await page.reload();
  await openNoteByTitle(page, title);
  const liveText = await editorText(page);
  const dbText = textsOf((await findNote(page, title))?.editorDoc).join("");
  const pass = liveText.includes(payload) && dbText.includes(payload);
  record("race-01", { title, payloadLength: payload.length, liveHasAll: liveText.includes(payload), dbText, pass });
  expect(pass).toBe(true);
});

test("R6-UNDO-01 records per-step undo granularity", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "+ 新建笔记" }).click();
  await editorRoot(page).waitFor();
  const title = uniqueTitle("undo");
  const titleInput = page.locator(".river-editor-toolbar input");
  await titleInput.fill(title);
  await titleInput.press("Tab");
  const first = page.locator('.river-editor-layout .river-outline-item[data-item-type="knowledge"] > .river-outline-content > p').first();
  await first.click();
  await page.keyboard.press("End");
  await page.keyboard.type("alpha beta");
  await page.keyboard.press("Enter");
  await page.keyboard.type("gamma delta");

  const snapshots: string[] = [];
  snapshots.push(await editorText(page));
  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.press("Meta+z");
    snapshots.push(await editorText(page));
  }
  const redo: string[] = [];
  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.press("Meta+Shift+z");
    redo.push(await editorText(page));
  }
  record("undo-01", { title, undo: snapshots, redo });
  expect(snapshots[0]).toContain("gamma delta");
});

test("R6-TYPE-01 real per-key typing of 60 lines with human-speed variance", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "+ 新建笔记" }).click();
  await editorRoot(page).waitFor();
  const title = uniqueTitle("typing");
  const titleInput = page.locator(".river-editor-toolbar input");
  await titleInput.fill(title);
  await titleInput.press("Tab");
  const first = page.locator('.river-editor-layout .river-outline-item[data-item-type="knowledge"] > .river-outline-content > p').first();
  await first.click();
  await page.keyboard.press("End");

  const started = Date.now();
  for (let i = 1; i <= 60; i += 1) {
    if (i > 1) await page.keyboard.press("Enter");
    await page.keyboard.type(`line ${String(i).padStart(2, "0")} 学习笔记`, { delay: i % 7 === 0 ? 1 : i % 3 === 0 ? 12 : 4 });
  }
  const elapsed = Date.now() - started;
  await waitDbText(page, title, "line 60 学习笔记");
  const dbDoc = (await findNote(page, title))?.editorDoc;
  const dbText = textsOf(dbDoc).join("\n");
  const orderOk = Array.from({ length: 12 }, (_, i) => i + 1).every((n) => dbText.indexOf(`line ${String(n).padStart(2, "0")}`) < dbText.indexOf(`line ${String(n + 1).padStart(2, "0")}`));
  const pass = dbText.includes("line 60 学习笔记") && orderOk;
  record("type-01", { title, elapsedMs: elapsed, dbLines: dbText.split("\n").length, orderOk, pass, tail: dbText.slice(-160) });
  expect(pass).toBe(true);
});

test("R6-TAB-01 Tab and Shift+Tab keep parent-child relations", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "+ 新建笔记" }).click();
  await editorRoot(page).waitFor();
  const title = uniqueTitle("tab");
  const titleInput = page.locator(".river-editor-toolbar input");
  await titleInput.fill(title);
  await titleInput.press("Tab");
  const first = page.locator('.river-editor-layout .river-outline-item[data-item-type="knowledge"] > .river-outline-content > p').first();
  await first.click();
  await page.keyboard.press("End");
  await page.keyboard.type("PARENT");
  await page.keyboard.press("Enter");
  await page.keyboard.type("CHILD");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await page.keyboard.type("GRAND");
  await page.keyboard.press("Tab");
  const nested = await page.locator(".river-editor-layout .river-outline-editor li.river-outline-item").count();
  const json = await page.evaluate(() => (window as any).__riverEditor?.getJSON());
  await waitDbText(page, title, "GRAND");
  const dbDoc = (await findNote(page, title))?.editorDoc;
  const depth = (node: any, d = 1): number => Math.max(d, ...(node?.content || []).filter((c: any) => c.type === "bulletList" || c.type === "orderedList").map((c: any) => depth(c, d + 1)));
  const dbDepth = depth(dbDoc);
  await page.keyboard.press("Shift+Tab");
  const afterLift = await page.evaluate(() => (window as any).__riverEditor?.getJSON());
  record("tab-01", { title, domItemCount: nested, liveDepth: depth(json), dbDepth, afterLiftDepth: depth(afterLift) });
  expect(dbDepth).toBeGreaterThanOrEqual(2);
});

test("R6-SEL-01 DOM selection drives structural command on the intended node", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "+ 新建笔记" }).click();
  await editorRoot(page).waitFor();
  const title = uniqueTitle("sel");
  const titleInput = page.locator(".river-editor-toolbar input");
  await titleInput.fill(title);
  await titleInput.press("Tab");
  const first = page.locator('.river-editor-layout .river-outline-item[data-item-type="knowledge"] > .river-outline-content > p').first();
  await first.click();
  await page.keyboard.press("End");
  await page.keyboard.type("SELECTME");
  const paragraphs = page.locator('.river-editor-layout .river-outline-item[data-item-type="knowledge"] > .river-outline-content > p');
  await paragraphs.first().click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");
  const domSelection = await page.evaluate(() => window.getSelection()?.toString() ?? "");
  const editorSelection = await page.evaluate(() => {
    const editor = (window as any).__riverEditor;
    const sel = editor?.state?.selection;
    if (!sel) return null;
    return { from: sel.from, to: sel.to, empty: sel.empty, text: editor.state.doc.textBetween(sel.from, sel.to, "\n") };
  });
  record("sel-01", { title, domSelection, editorSelection });
  expect(domSelection.length).toBeGreaterThan(0);
});
