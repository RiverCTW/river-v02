export type EditorFlush = () => void | Promise<void>;

/**
 * The standalone editor lives below the app shell, while "return to library"
 * is rendered by the shell. A module-level registry gives the shell a single,
 * awaitable hand-off point without threading refs through every layer.
 */
const activeFlushes = new Map<string, EditorFlush>();
const activeTitleRenamers = new Map<string, (title: string) => boolean>();

export function registerEditorFlush(flush: EditorFlush, instanceId = "main"): () => void {
  activeFlushes.set(instanceId, flush);
  return () => {
    if (activeFlushes.get(instanceId) === flush) activeFlushes.delete(instanceId);
  };
}

export async function flushActiveEditor(instanceId = "main"): Promise<void> {
  const flush = activeFlushes.get(instanceId)
    || (instanceId === "main" ? [...activeFlushes.entries()].find(([key]) => key.startsWith("main:"))?.[1] : undefined);
  if (!flush) return;
  await flush();
}

export async function flushAllEditors(): Promise<void> {
  await Promise.all([...activeFlushes.values()].map((flush) => flush()));
}

/**
 * The toolbar title and the first root outline item are two views of the same
 * document title. The editor owns the document, so a rename must go through a
 * ProseMirror transaction instead of rebuilding the bundle behind its back.
 */
export function registerEditorTitleRenamer(rename: (title: string) => boolean, instanceId = "main"): () => void {
  activeTitleRenamers.set(instanceId, rename);
  return () => {
    if (activeTitleRenamers.get(instanceId) === rename) activeTitleRenamers.delete(instanceId);
  };
}

export function renameActiveEditorTitle(title: string, instanceId = "main"): boolean {
  const rename = activeTitleRenamers.get(instanceId)
    || (instanceId === "main" ? [...activeTitleRenamers.entries()].find(([key]) => key.startsWith("main:"))?.[1] : undefined);
  return rename ? rename(title) : false;
}
