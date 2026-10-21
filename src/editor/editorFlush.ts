export type EditorFlush = () => void | Promise<void>;

/**
 * The standalone editor lives below the app shell, while "return to library"
 * is rendered by the shell. A module-level registry gives the shell a single,
 * awaitable hand-off point without threading refs through every layer.
 */
let activeFlush: EditorFlush | null = null;
let activeTitleRenamer: ((title: string) => boolean) | null = null;

export function registerEditorFlush(flush: EditorFlush): () => void {
  activeFlush = flush;
  return () => {
    if (activeFlush === flush) activeFlush = null;
  };
}

export async function flushActiveEditor(): Promise<void> {
  const flush = activeFlush;
  if (!flush) return;
  await flush();
}

/**
 * The toolbar title and the first root outline item are two views of the same
 * document title. The editor owns the document, so a rename must go through a
 * ProseMirror transaction instead of rebuilding the bundle behind its back.
 */
export function registerEditorTitleRenamer(rename: (title: string) => boolean): () => void {
  activeTitleRenamer = rename;
  return () => {
    if (activeTitleRenamer === rename) activeTitleRenamer = null;
  };
}

export function renameActiveEditorTitle(title: string): boolean {
  return activeTitleRenamer ? activeTitleRenamer(title) : false;
}
