import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { getNoteBundle, updateNote } from "../db/database";
import type { NoteBundle } from "../types";
import { OutlineEditor } from "../editor/OutlineEditor";
import { FolderTree } from "./FolderTree";
import { FolderIcon, Icon } from "./IconSprite";
import { NoteList } from "./NoteList";

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
  const createNoteAction = useAppStore((state) => state.createNoteAction);
  const openNote = useAppStore((state) => state.openNote);
  const deleteNoteAction = useAppStore((state) => state.deleteNoteAction);
  const restoreNoteAction = useAppStore((state) => state.restoreNoteAction);
  const moveNoteAction = useAppStore((state) => state.moveNoteAction);
  const refreshLibrary = useAppStore((state) => state.refreshLibrary);
  const saveInlineTree = useAppStore((state) => state.saveInlineTree);
  const setUIStyle = useAppStore((state) => state.setUIStyle);
  const focusMode = useAppStore((state) => state.focusMode);
  const toggleFocusMode = useAppStore((state) => state.toggleFocusMode);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(notes[0]?.id || null);
  const [selectedBundle, setSelectedBundle] = useState<NoteBundle | null>(null);
  const [libraryTitle, setLibraryTitle] = useState("");
  const [editorLoading, setEditorLoading] = useState(false);
  const flushEditorRef = useRef<(() => void | Promise<void>) | null>(null);
  const loadRequestRef = useRef(0);

  const visibleNotes = useMemo(() => {
    const filtered = selectedFolderId ? notes.filter((note) => note.folderId === selectedFolderId) : notes;
    return filtered;
  }, [notes, selectedFolderId]);

  const selectedNote = visibleNotes.find((note) => note.id === selectedNoteId) || visibleNotes[0] || null;

  useEffect(() => {
    if (selectedNote && selectedNote.id !== selectedNoteId) setSelectedNoteId(selectedNote.id);
    if (!selectedNote && selectedNoteId) setSelectedNoteId(null);
  }, [selectedNote, selectedNoteId]);

  useEffect(() => {
    if (!selectedNote?.id) {
      void flushEditorRef.current?.();
      setSelectedBundle(null);
      setLibraryTitle("");
      return;
    }
    let cancelled = false;
    const request = ++loadRequestRef.current;
    const flush = flushEditorRef.current;
    const load = async () => {
      // Flush before reading the next note. The old editor stays mounted until
      // this completes, so its cleanup cannot discard the last keystrokes.
      await flush?.();
      if (cancelled || request !== loadRequestRef.current) return;
      setEditorLoading(true);
      try {
        const nextBundle = await getNoteBundle(selectedNote.id);
        if (cancelled || request !== loadRequestRef.current) return;
        setSelectedBundle(nextBundle);
        setLibraryTitle(nextBundle?.note.title || "");
      } catch {
        if (cancelled || request !== loadRequestRef.current) return;
        setSelectedBundle(null);
        setLibraryTitle("");
      } finally {
        if (!cancelled && request === loadRequestRef.current) setEditorLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [selectedNote?.id]);

  const onCreateFolder = async (parentId: string | null) => {
    const name = window.prompt("文件夹名称", "新建学科");
    if (name) await createFolderAction(name, parentId);
  };

  const onRenameFolder = async (folder: { id: string; name: string }) => {
    const name = window.prompt("重命名文件夹", folder.name);
    if (name) await renameFolderAction(folder.id, name);
  };

  const onDeleteFolder = async (folder: { id: string; name: string }) => {
    const confirmed = window.confirm(`删除文件夹“${folder.name}”？里面的笔记会移动到根目录。`);
    if (confirmed) await deleteFolderAction(folder.id);
  };

  const onCreateNote = async () => {
    await flushEditorRef.current?.();
    const noteId = await createNoteAction(selectedFolderId);
    setSelectedNoteId(noteId);
  };

  const onDeleteNote = async (noteId: string) => {
    const confirmed = window.confirm("删除这条笔记？可以在“最近删除”中恢复。");
    if (confirmed) {
      if (selectedBundle?.note.id === noteId) await flushEditorRef.current?.();
      await deleteNoteAction(noteId);
      setSelectedNoteId(null);
    }
  };

  const saveLibraryTitle = async () => {
    if (!selectedBundle) return;
    await flushEditorRef.current?.();
    const nextTitle = libraryTitle.trim() || "未命名笔记";
    setLibraryTitle(nextTitle);
    if (nextTitle === selectedBundle.note.title) return;
    await updateNote(selectedBundle.note.id, { title: nextTitle });
    setSelectedBundle((current) => current?.note.id === selectedBundle.note.id
      ? { ...current, note: { ...current.note, title: nextTitle } }
      : current);
    await refreshLibrary();
  };

  const selectNote = async (noteId: string) => {
    if (noteId === selectedNote?.id) return;
    await flushEditorRef.current?.();
    setSelectedNoteId(noteId);
  };

  const openNoteSafely = async (noteId: string) => {
    await flushEditorRef.current?.();
    await openNote(noteId);
  };

  const openSelectedNote = async () => {
    if (!selectedBundle) return;
    await flushEditorRef.current?.();
    await openNote(selectedBundle.note.id);
  };

  return (
    <div className={`tmi-panel ${focusMode ? "is-focus" : ""}`} style={{ padding: 12 }}>
      <div className="tmi-window" style={{ borderColor: uiStyle === "notability" ? "var(--tmi-warm-border)" : undefined }}>
        <div className="tmi-window-top">
          <div className="tmi-window-dots"><i /><i /><i /></div>
          <div className="tmi-window-title">River 笔记库 · {uiStyle === "effie" ? "Effie 风格" : "Notability 风格"}</div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button className={`river-chip ${uiStyle === "effie" ? "selected" : ""}`} onClick={() => setUIStyle("effie")}>Effie</button>
            <button className={`river-chip ${uiStyle === "notability" ? "selected" : ""}`} onClick={() => setUIStyle("notability")}>Notability</button>
          </div>
        </div>
        <div className={`tmi-window-body ${focusMode ? "is-focus" : ""} ${uiStyle === "effie" ? "tmi-effie-grid" : "tmi-notability-grid"}`}>
          <aside className={`tmi-rail ${uiStyle === "notability" ? "tmi-rail-paper" : ""}`}>
            <div className="tmi-nav-item"><Icon name="search" />搜索</div>
            <div className="tmi-nav-item is-active"><Icon name="notebook" />全部笔记</div>
            <div className="tmi-nav-item"><Icon name="star" />收藏夹</div>
            <div className="tmi-nav-item"><Icon name="clock" />最近使用</div>
            <div className="tmi-nav-item"><Icon name="trash" />最近删除 {deletedNotes.length > 0 ? `(${deletedNotes.length})` : ""}</div>
            <div className="tmi-nav-item"><Icon name="library" />本地资料库</div>
            <div className="tmi-nav-item"><Icon name="preferences" />笔记偏好</div>
            <div className="tmi-rail-label">笔记分类</div>
            <FolderTree
              folders={folders}
              selectedFolderId={selectedFolderId}
              onSelect={setSelectedFolderId}
              onCreate={onCreateFolder}
              onRename={onRenameFolder}
              onDelete={onDeleteFolder}
            />
            <button className="river-button" onClick={() => onCreateFolder(null)} style={{ marginTop: 8 }}>+ 新建文件夹</button>
            {deletedNotes.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div className="tmi-rail-label">最近删除</div>
                {deletedNotes.map((note) => (
                  <button key={note.id} className="tmi-nav-item" style={{ width: "100%", textAlign: "left" }} onClick={() => restoreNoteAction(note.id)}>
                    {note.title} · 恢复
                  </button>
                ))}
              </div>
            )}
          </aside>
          <section className={`tmi-listcol ${uiStyle === "notability" ? "tmi-listcol-paper" : ""}`}>
            <div className="tmi-list-head">
              <span>{selectedFolderId ? folders.find((folder) => folder.id === selectedFolderId)?.name || "文件夹" : "全部笔记"}</span>
              <span>{visibleNotes.length} 条</span>
            </div>
            <div className="river-chip-row" style={{ marginBottom: 10 }}>
              <input
                className="river-input"
                style={{ flex: 1, minWidth: 120 }}
                placeholder="搜索笔记标题或内容"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              <button className="river-button primary" onClick={onCreateNote}>+ 新建笔记</button>
            </div>
            {visibleNotes.length === 0 ? (
              <div className="river-empty">这个文件夹还没有笔记。<br />点击“新建笔记”开始。</div>
            ) : (
              <NoteList
                notes={visibleNotes}
                folders={folders}
                selectedNoteId={selectedNote?.id || null}
                uiStyle={uiStyle}
                onSelect={(noteId) => { void selectNote(noteId); }}
                onOpen={(noteId) => { void openNoteSafely(noteId); }}
                onDelete={onDeleteNote}
                onMove={moveNoteAction}
              />
            )}
          </section>
          <main className={`tmi-preview ${uiStyle === "notability" ? "tmi-preview-paper" : ""} ${focusMode ? "is-focus" : ""}`}>
            {editorLoading ? (
              <div className="river-empty">正在载入笔记…</div>
            ) : selectedBundle ? (
              <div className="tmi-inline-editor">
                <div className="tmi-inline-editor-head">
                  <FolderIcon />
                  <input
                    className="river-input"
                    value={libraryTitle}
                    onChange={(event) => setLibraryTitle(event.target.value)}
                    onBlur={saveLibraryTitle}
                    aria-label="笔记标题"
                  />
                  <button className="river-button" onClick={openSelectedNote}>独立笔记页</button>
                </div>
                <OutlineEditor
                  bundle={selectedBundle}
                  onChange={async (nodes, blocks, editorDoc) => {
                    const noteId = selectedBundle.note.id;
                    setSelectedBundle((current) => current && current.note.id === noteId
                      ? {
                        ...current,
                        note: {
                          ...current.note,
                          editorDoc,
                          revision: (current.note.revision || 0) + 1,
                          updatedAt: new Date().toISOString(),
                        },
                        nodes,
                        blocks,
                      }
                      : current);
                    await saveInlineTree(noteId, nodes, blocks, editorDoc);
                  }}
                  focusMode={focusMode}
                  onToggleFocus={toggleFocusMode}
                  registerFlush={(flush) => { flushEditorRef.current = flush; }}
                  compact={!focusMode}
                />
              </div>
            ) : (
              <div className="river-empty">
                选择一条笔记即可在右侧直接编辑。<br />
                双击卡片可以进入独立笔记页。
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
