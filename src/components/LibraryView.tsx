import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { db, getNoteBundle } from "../db/database";
import type { Folder, NoteBundle, SourceDocument } from "../types";
import { OutlineEditor } from "../editor/OutlineEditor";
import { FolderTree } from "./FolderTree";
import { FolderIcon, Icon } from "./IconSprite";
import { NoteList } from "./NoteList";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";

type LibraryViewMode = "all" | "favorites" | "recent" | "trash" | "library" | "preferences" | "folder" | "search";

export function LibraryView() {
  const folders = useAppStore((state) => state.folders);
  const notes = useAppStore((state) => state.notes);
  const deletedNotes = useAppStore((state) => state.deletedNotes);
  const uiStyle = useAppStore((state) => state.uiStyle);
  const searchQuery = useAppStore((state) => state.searchQuery);
  const setSearchQuery = useAppStore((state) => state.setSearchQuery);
  const createFolderAction = useAppStore((state) => state.createFolderAction);
  const renameFolderAction = useAppStore((state) => state.renameFolderAction);
  const deleteFolderAction = useAppStore((state) => state.deleteFolderAction);
  const restoreFolderAction = useAppStore((state) => state.restoreFolderAction);
  const permanentlyDeleteFolderAction = useAppStore((state) => state.permanentlyDeleteFolderAction);
  const moveFolderAction = useAppStore((state) => state.moveFolderAction);
  const createNoteAction = useAppStore((state) => state.createNoteAction);
  const openNote = useAppStore((state) => state.openNote);
  const deleteNoteAction = useAppStore((state) => state.deleteNoteAction);
  const restoreNoteAction = useAppStore((state) => state.restoreNoteAction);
  const permanentlyDeleteNoteAction = useAppStore((state) => state.permanentlyDeleteNoteAction);
  const moveNoteAction = useAppStore((state) => state.moveNoteAction);
  const renameNoteAction = useAppStore((state) => state.renameNoteAction);
  const toggleFavoriteAction = useAppStore((state) => state.toggleFavoriteAction);
  const togglePinnedAction = useAppStore((state) => state.togglePinnedAction);
  const duplicateNoteAction = useAppStore((state) => state.duplicateNoteAction);
  const refreshLibrary = useAppStore((state) => state.refreshLibrary);
  const saveInlineTree = useAppStore((state) => state.saveInlineTree);
  const focusMode = useAppStore((state) => state.focusMode);
  const toggleFocusMode = useAppStore((state) => state.toggleFocusMode);

  const initialFolder = typeof sessionStorage !== "undefined" ? sessionStorage.getItem("river.library.folder") : null;
  const [view, setView] = useState<LibraryViewMode>(initialFolder ? "folder" : "all");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(initialFolder);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(notes[0]?.id || null);
  const [selectedBundle, setSelectedBundle] = useState<NoteBundle | null>(null);
  const [libraryTitle, setLibraryTitle] = useState("");
  const [editorLoading, setEditorLoading] = useState(false);
  const [sources, setSources] = useState<SourceDocument[]>([]);
  const [copiedNoteId, setCopiedNoteId] = useState<string | null>(null);
  const [folderMenu, setFolderMenu] = useState<{ x: number; y: number; folder: Folder } | null>(null);
  const flushEditorRef = useRef<(() => void | Promise<void>) | null>(null);
  const loadRequestRef = useRef(0);

  useEffect(() => { sessionStorage.removeItem("river.library.folder"); }, []);

  const deletedFolders = useMemo(() => folders.filter((folder) => folder.deletedAt && folder.deletedRootId === folder.id), [folders]);

  const visibleNotes = useMemo(() => {
    if (view === "favorites") return notes.filter((note) => note.favorite);
    if (view === "recent") return [...notes].sort((a, b) => String(b.lastOpenedAt || "").localeCompare(String(a.lastOpenedAt || "")));
    if (view === "trash") return deletedNotes;
    if (view === "folder") return notes.filter((note) => note.folderId === selectedFolderId);
    if (view === "search") return notes;
    if (view === "all") return notes;
    return [];
  }, [view, notes, deletedNotes, selectedFolderId]);

  const selectedNote = visibleNotes.find((note) => note.id === selectedNoteId) || visibleNotes[0] || null;

  useEffect(() => { void refreshLibrary(); }, [refreshLibrary]);
  useEffect(() => {
    db.sources.toArray().then((records) => setSources(records.sort((a, b) => b.createdAt.localeCompare(a.createdAt))));
  }, [notes.length]);

  useEffect(() => {
    if (selectedNote && selectedNote.id !== selectedNoteId) setSelectedNoteId(selectedNote.id);
    if (!selectedNote && selectedNoteId) setSelectedNoteId(null);
  }, [selectedNote, selectedNoteId]);

  useEffect(() => {
    if (view === "trash" || view === "library" || view === "preferences") {
      setSelectedBundle(null);
      return;
    }
    if (!selectedNote?.id || Boolean(selectedNote.deletedAt)) {
      setSelectedBundle(null);
      setLibraryTitle("");
      return;
    }
    let cancelled = false;
    const request = ++loadRequestRef.current;
    const load = async () => {
      await flushEditorRef.current?.();
      if (cancelled || request !== loadRequestRef.current) return;
      setEditorLoading(true);
      try {
        const bundle = await getNoteBundle(selectedNote.id);
        if (cancelled || request !== loadRequestRef.current) return;
        setSelectedBundle(bundle);
        setLibraryTitle(bundle?.note.title || "");
      } finally {
        if (!cancelled && request === loadRequestRef.current) setEditorLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [selectedNote?.id, view]);

  const selectView = (next: LibraryViewMode) => {
    setView(next);
    if (next !== "folder") setSelectedFolderId(null);
  };

  const onCreateFolder = async (parentId: string | null) => {
    const name = window.prompt(parentId ? "子文件夹名称" : "文件夹名称", "新建文件夹");
    if (name?.trim()) await createFolderAction(name.trim(), parentId);
  };

  const folderMenuItems = (folder: Folder): ContextMenuItem[] => [
    { id: "note", label: "新建笔记", action: async () => { setSelectedFolderId(folder.id); setView("folder"); await createNoteAction(folder.id); } },
    { id: "child", label: "添加子文件夹", action: () => onCreateFolder(folder.id) },
    { id: "sibling", label: "添加同级文件夹", action: () => onCreateFolder(folder.parentId) },
    { id: "rename", label: "重命名", action: async () => { const name = window.prompt("重命名文件夹", folder.name); if (name?.trim()) await renameFolderAction(folder.id, name.trim()); } },
    { id: "delete", label: "删除文件夹及内部笔记", danger: true, action: async () => { if (window.confirm(`将“${folder.name}”及整个子树移入最近删除？`)) await deleteFolderAction(folder.id); } },
  ];

  const onCreateNote = async () => {
    await flushEditorRef.current?.();
    const noteId = await createNoteAction(view === "folder" ? selectedFolderId : null);
    setSelectedNoteId(noteId);
  };

  const openNoteSafely = async (noteId: string) => {
    await flushEditorRef.current?.();
    await openNote(noteId);
  };

  const pasteCopiedNote = async (targetFolderId: string | null) => {
    if (!copiedNoteId) return;
    await moveNoteAction(copiedNoteId, targetFolderId);
    setCopiedNoteId(null);
  };

  const headerLabel = view === "favorites" ? "收藏夹" : view === "recent" ? "最近使用" : view === "trash" ? "最近删除" : view === "library" ? "本地资料库" : view === "preferences" ? "笔记偏好" : view === "folder" ? folders.find((folder) => folder.id === selectedFolderId)?.name || "文件夹" : view === "search" ? `搜索：${searchQuery}` : "全部笔记";

  return (
    <div className={`tmi-panel ${focusMode ? "is-focus" : ""}`} style={{ padding: 12 }}>
      <div className="tmi-window">
        <div className="tmi-window-top"><div className="tmi-window-dots"><i /><i /><i /></div><div className="tmi-window-title">River 笔记库</div></div>
        <div className={`tmi-window-body ${focusMode ? "is-focus" : ""} ${uiStyle === "effie" ? "tmi-effie-grid" : "tmi-notability-grid"}`}>
          <aside className={`tmi-rail ${uiStyle === "notability" ? "tmi-rail-paper" : ""}`}>
            <div className="tmi-nav-search"><Icon name="search" /><input value={searchQuery} placeholder="搜索" onChange={(event) => { setSearchQuery(event.target.value); setView(event.target.value.trim() ? "search" : "all"); }} /></div>
            {[
              ["all", "全部笔记", "notebook"], ["favorites", "收藏夹", "star"], ["recent", "最近使用", "clock"],
              ["trash", "最近删除", "trash"], ["library", "本地资料库", "library"], ["preferences", "笔记偏好", "preferences"],
            ].map(([id, label, icon]) => <button key={id} className={`tmi-nav-item ${view === id ? "is-active" : ""}`} onClick={() => selectView(id as LibraryViewMode)}><Icon name={icon} />{label}{id === "trash" && deletedNotes.length ? ` (${deletedNotes.length})` : ""}</button>)}
            <div className="tmi-rail-title-row"><div className="tmi-rail-label">笔记分类</div><button className="river-icon-button" title="新建文件夹" onClick={() => void onCreateFolder(null)}>+</button></div>
            <FolderTree
              folders={folders}
              selectedFolderId={selectedFolderId}
              onSelect={(folderId) => { setSelectedFolderId(folderId); setView(folderId ? "folder" : "all"); }}
              onCreate={(parentId) => void onCreateFolder(parentId)}
              onContextMenu={(folder, event) => setFolderMenu({ folder, x: event.clientX, y: event.clientY })}
              onMoveFolder={moveFolderAction}
            />
          </aside>

          <section className={`tmi-listcol ${uiStyle === "notability" ? "tmi-listcol-paper" : ""}`}>
            <div className="tmi-list-head"><span>{headerLabel}</span><span>{view === "library" ? sources.length + " 项" : view === "trash" ? deletedNotes.length + deletedFolders.length + " 项" : visibleNotes.length + " 条"}</span></div>
            <div className="river-chip-row" style={{ marginBottom: 10 }}>
              {view !== "trash" && view !== "library" && view !== "preferences" && <button className="river-button primary" onClick={() => void onCreateNote()}>+ 新建笔记</button>}
            </div>

            {view === "library" ? (
              <div className="river-source-library">{sources.map((source) => <div className="river-source-row" key={source.id}><Icon name="notebook" /><div><b>{source.fileName}</b><small>{source.kind.toUpperCase()} · {source.parseStatus} · {new Date(source.createdAt).toLocaleDateString("zh-CN")}</small></div></div>)}</div>
            ) : view === "preferences" ? (
              <div className="river-empty">笔记偏好全局设置暂未开放。</div>
            ) : view === "trash" ? (
              <div className="river-trash-list">
                {deletedFolders.map((folder) => <div className="river-trash-row" key={folder.id}><b>{folder.name}</b><span>文件夹树</span><button className="river-button" onClick={() => void restoreFolderAction(folder.id)}>恢复</button><button className="river-button danger" onClick={() => { if (window.confirm("永久删除整个文件夹树？此操作不可撤销。")) void permanentlyDeleteFolderAction(folder.id); }}>永久删除</button></div>)}
                {visibleNotes.length > 0 && <NoteList {...{ notes: visibleNotes, folders, selectedNoteId: selectedNote?.id || null, uiStyle, deletedView: true }} onSelect={setSelectedNoteId} onOpen={openNoteSafely} onDelete={deleteNoteAction} onRestore={restoreNoteAction} onPermanentDelete={(id) => { if (window.confirm("永久删除这篇笔记？")) void permanentlyDeleteNoteAction(id); }} onMove={moveNoteAction} onFavorite={toggleFavoriteAction} onPin={togglePinnedAction} onRename={renameNoteAction} onDuplicate={(id) => void duplicateNoteAction(id)} onCopy={setCopiedNoteId} onPaste={(id) => { const note = notes.find((item) => item.id === id); if (note) void pasteCopiedNote(note.folderId); }} canPaste={Boolean(copiedNoteId)} />}
                {!deletedNotes.length && !deletedFolders.length && <div className="river-empty">最近删除为空。</div>}
              </div>
            ) : visibleNotes.length === 0 ? (
              <div className="river-empty">这里还没有笔记。</div>
            ) : (
              <NoteList
                notes={visibleNotes}
                folders={folders}
                selectedNoteId={selectedNote?.id || null}
                uiStyle={uiStyle}
                onSelect={(noteId) => { setSelectedNoteId(noteId); }}
                onOpen={(noteId) => void openNoteSafely(noteId)}
                onDelete={(noteId) => { if (window.confirm("将这篇笔记移入最近删除？")) void deleteNoteAction(noteId); }}
                onMove={moveNoteAction}
                onFavorite={toggleFavoriteAction}
                onPin={togglePinnedAction}
                onRename={renameNoteAction}
                onDuplicate={(id) => void duplicateNoteAction(id)}
                onCopy={setCopiedNoteId}
                onPaste={(id) => { const note = notes.find((item) => item.id === id); if (note) void pasteCopiedNote(note.folderId); }}
                canPaste={Boolean(copiedNoteId)}
              />
            )}
          </section>

          <main className={`tmi-preview ${uiStyle === "notability" ? "tmi-preview-paper" : ""} ${focusMode ? "is-focus" : ""}`}>
            {editorLoading ? <div className="river-empty">正在载入笔记…</div> : selectedBundle ? (
              <div className="tmi-inline-editor">
                <div className="tmi-inline-editor-head"><FolderIcon /><input className="river-input" value={libraryTitle} onChange={(event) => setLibraryTitle(event.target.value)} onBlur={() => void renameNoteAction(selectedBundle.note.id, libraryTitle)} aria-label="笔记标题" /><span className="river-location">{folders.find((folder) => folder.id === selectedBundle.note.folderId)?.name || "根目录"}</span><button className="river-button" onClick={openSelectedNote}>独立笔记页</button></div>
                <OutlineEditor
                  bundle={selectedBundle}
                  instanceId={`library:${selectedBundle.note.id}`}
                  compact
                  focusMode={focusMode}
                  onToggleFocus={toggleFocusMode}
                  registerFlush={(flush) => { flushEditorRef.current = flush; }}
                  onChange={async (nodes, blocks, editorDoc) => {
                    const noteId = selectedBundle.note.id;
                    setSelectedBundle((current) => current && current.note.id === noteId ? { ...current, note: { ...current.note, editorDoc, updatedAt: new Date().toISOString() }, nodes, blocks } : current);
                    await saveInlineTree(noteId, nodes, blocks, editorDoc);
                  }}
                />
              </div>
            ) : <div className="river-empty">选择一条笔记即可在右侧直接编辑。<br />双击卡片进入独立笔记页。</div>}
          </main>
        </div>
      </div>
      {folderMenu && <ContextMenu x={folderMenu.x} y={folderMenu.y} items={folderMenuItems(folderMenu.folder)} onClose={() => setFolderMenu(null)} />}
    </div>
  );

  async function openSelectedNote() {
    if (!selectedBundle) return;
    await flushEditorRef.current?.();
    await openNote(selectedBundle.note.id);
  }
}
