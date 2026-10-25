import { useEffect, useMemo, useState } from "react";
import { db } from "../db/database";
import type { Folder, Note, UIStyle } from "../types";
import { FolderIcon, Icon } from "./IconSprite";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";

interface NoteListProps {
  notes: Note[];
  folders: Folder[];
  selectedNoteId: string | null;
  uiStyle: UIStyle;
  deletedView?: boolean;
  onSelect: (noteId: string) => void;
  onOpen: (noteId: string) => void;
  onDelete: (noteId: string) => void;
  onRestore?: (noteId: string) => void;
  onPermanentDelete?: (noteId: string) => void;
  onMove: (noteId: string, folderId: string | null) => void;
  onFavorite: (noteId: string) => void;
  onPin: (noteId: string) => void;
  onRename: (noteId: string, title: string) => void;
  onDuplicate: (noteId: string) => void;
  onCopy: (noteId: string) => void;
  onPaste: (noteId: string) => void;
  canPaste: boolean;
}

interface MenuState { x: number; y: number; note: Note }

function tabWidthPercent(title: string): number {
  const measured = Array.from(title.replace(/\s+/g, " ")).reduce((width, character) => width + (/[\u2e80-\u9fff]/u.test(character) ? 9 : 6), 0);
  return Math.max(18, Math.min(50, ((52 + measured) / 760) * 100));
}

function EffieCardOutline({ title }: { title: string }) {
  const tabEnd = Math.max(137, Math.min(380, (760 * tabWidthPercent(title)) / 100));
  const curveStart = tabEnd;
  return (
    <svg className="effie-card-outline" viewBox="0 0 760 224" preserveAspectRatio="none" aria-hidden="true">
      <path d={`M22 1 H${curveStart - 22} C${curveStart - 8} 1 ${curveStart} 7 ${curveStart + 7} 17 L${curveStart + 20} 37 C${curveStart + 25} 47 ${curveStart + 34} 53 ${curveStart + 46} 53 H716 C741 53 759 70 759 94 V198 C759 213 747 223 732 223 H27 C12 223 1 211 1 196 V28 C1 13 11 1 22 1 Z`} />
    </svg>
  );
}

export function NoteList(props: NoteListProps) {
  const { notes, folders, selectedNoteId, uiStyle, deletedView, onSelect, onOpen } = props;
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [movingNote, setMovingNote] = useState<Note | null>(null);
  const [moveTarget, setMoveTarget] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    if (!notes.length) { setPreviews({}); return; }
    db.blocks.where("noteId").anyOf(notes.map((note) => note.id)).toArray().then((blocks) => {
      if (cancelled) return;
      const map: Record<string, string> = {};
      blocks.sort((a, b) => a.order - b.order).forEach((block) => {
        if (!map[block.noteId] && block.text.trim()) map[block.noteId] = block.text.replace(/\n+/g, " ").slice(0, 150);
      });
      setPreviews(map);
    });
    return () => { cancelled = true; };
  }, [notes]);

  const sortedNotes = useMemo(() => [...notes].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt.localeCompare(a.updatedAt)), [notes]);

  const menuItems = (note: Note): ContextMenuItem[] => deletedView ? [
    { id: "restore", label: "恢复笔记", action: () => props.onRestore?.(note.id) },
    { id: "delete", label: "永久删除", danger: true, action: () => props.onPermanentDelete?.(note.id) },
  ] : [
    { id: "rename", label: "重命名", action: () => { const title = window.prompt("笔记名称", note.title); if (title?.trim()) props.onRename(note.id, title.trim()); } },
    { id: "move", label: "移动到…", action: () => { setMovingNote(note); setMoveTarget(note.folderId || ""); } },
    { id: "share", label: "分享", hint: "暂未开放", disabled: true },
    { id: "delete", label: "删除笔记", danger: true, action: () => props.onDelete(note.id) },
    { id: "pin", label: note.pinned ? "取消置顶" : "置顶（当前文件夹）", action: () => props.onPin(note.id) },
    { id: "favorite", label: note.favorite ? "取消收藏" : "收藏", action: () => props.onFavorite(note.id) },
    { id: "duplicate", label: "新建副本", action: () => props.onDuplicate(note.id) },
    { id: "copy", label: "拷贝（用于移动）", action: () => props.onCopy(note.id) },
    { id: "paste", label: "粘贴到该笔记本文件夹", disabled: !props.canPaste, action: () => props.onPaste(note.id) },
  ];

  const context = (note: Note) => (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ x: event.clientX, y: event.clientY, note });
  };

  const folderName = (folderId: string | null) => folderId ? folders.find((folder) => folder.id === folderId)?.name || "未分类" : "根目录";

  const moveDialog = movingNote ? (
    <div className="river-move-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setMovingNote(null); }}>
      <div className="river-move-dialog" role="dialog" aria-modal="true" aria-labelledby="river-move-title">
        <h3 id="river-move-title">移动“{movingNote.title}”</h3>
        <label>目标文件夹<select className="river-input" value={moveTarget} onChange={(event) => setMoveTarget(event.target.value)}><option value="">根目录</option>{folders.filter((folder) => !folder.deletedAt).map((folder) => <option key={folder.id} value={folder.id}>{folderName(folder.id)}</option>)}</select></label>
        <div className="river-move-actions"><button className="river-button" onClick={() => setMovingNote(null)}>取消</button><button className="river-button primary" onClick={() => { props.onMove(movingNote.id, moveTarget || null); setMovingNote(null); }}>确认移动</button></div>
      </div>
    </div>
  ) : null;

  if (uiStyle === "notability") {
    return (
      <>
        <div className="tmi-paper-grid">
          {sortedNotes.map((note) => (
            <div className="tmi-paper-item" key={note.id} data-testid={`note-card-${note.id}`}>
              <article className={`tmi-paper-sheet ${selectedNoteId === note.id ? "is-selected" : ""}`} onClick={() => onSelect(note.id)} onDoubleClick={() => !deletedView && onOpen(note.id)} onContextMenu={context(note)}>
                <button className={`note-heart ${note.favorite ? "is-favorite" : ""}`} onClick={(event) => { event.stopPropagation(); props.onFavorite(note.id); }} aria-label={note.favorite ? "取消收藏" : "收藏"}>{note.favorite ? "♥" : "♡"}</button>
                <div className="tmi-sheet-title">{note.title}</div>
                <div className="tmi-sheet-rule" />
                <div className="tmi-sheet-line">{previews[note.id] || "还没有内容，打开后开始学习。"}</div>
                <div className="tmi-sheet-date">最近修改：{new Date(note.updatedAt).toLocaleDateString("zh-CN")}</div>
              </article>
              <div className="tmi-paper-filename">{folderName(note.folderId)} / {note.title}.note</div>
            </div>
          ))}
        </div>
        {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.note)} onClose={() => setMenu(null)} />}
        {moveDialog}
      </>
    );
  }

  return (
    <>
      <div className="tmi-note-list effie-note-list">
        {sortedNotes.map((note) => (
          <article
            className={`tmi-note effie-note-card ${selectedNoteId === note.id ? "is-selected" : ""} ${note.pinned ? "is-pinned" : ""}`}
            key={note.id}
            data-testid={`note-card-${note.id}`}
            onClick={() => onSelect(note.id)}
            onDoubleClick={() => !deletedView && onOpen(note.id)}
            onContextMenu={context(note)}
          >
            <EffieCardOutline title={note.title} />
            <div className="effie-card-content">
              <div className="effie-card-tab" style={{ maxWidth: `${tabWidthPercent(note.title)}%` }}><FolderIcon /><span>{note.title.replace(/\s+/g, " ")}</span></div>
              <button className={`note-heart ${note.favorite ? "is-favorite" : ""}`} onClick={(event) => { event.stopPropagation(); props.onFavorite(note.id); }} aria-label={note.favorite ? "取消收藏" : "收藏"}>{note.favorite ? "♥" : "♡"}</button>
              <div className="effie-card-title tmi-note-title">{note.title}</div>
              <div className="effie-card-preview tmi-note-preview">{previews[note.id] || "还没有内容，打开后开始学习。"}</div>
              <div className="effie-card-footer"><span><Icon name="clock" /> {new Date(note.updatedAt).toLocaleDateString("zh-CN")}</span><span>{folderName(note.folderId)}</span></div>
              {!deletedView && <button className="river-test-open" onClick={(event) => { event.stopPropagation(); onOpen(note.id); }}>打开</button>}
              {!deletedView && <button className="river-test-delete" onClick={(event) => { event.stopPropagation(); props.onDelete(note.id); }}>删除</button>}
            </div>
          </article>
        ))}
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.note)} onClose={() => setMenu(null)} />}
      {moveDialog}
    </>
  );
}
