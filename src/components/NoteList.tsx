import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { db } from "../db/database";
import type { Folder, Note, UIStyle } from "../types";
import { Icon } from "./IconSprite";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";
import "../styles/note-cards.css";

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

const TAB_FONT = '600 11px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif';
const TAB_PADDING = 44;

function outlinePath(width: number, height: number, requestedTab: number): string {
  const w = Math.max(160, width);
  const h = Math.max(120, height);
  const t = Math.max(64, Math.min(requestedTab, w * 0.6, w - 96));
  return [
    "M20 1",
    `H${t - 20}`,
    `C${t - 8} 1 ${t} 6 ${t + 6} 15`,
    `L${t + 18} 36`,
    `C${t + 23} 46 ${t + 33} 53 ${t + 46} 53`,
    `H${w - 28}`,
    `C${w - 12} 53 ${w - 1} 67 ${w - 1} 88`,
    `V${h - 24}`,
    `C${w - 1} ${h - 10} ${w - 12} ${h - 1} ${w - 28} ${h - 1}`,
    "H20",
    `C8 ${h - 1} 1 ${h - 10} 1 ${h - 24}`,
    "V20",
    "C1 9 9 1 20 1",
    "Z",
  ].join(" ");
}

function EffieNoteCard({ note, preview, selected, deletedView, folderLabel, onSelect, onOpen, onDelete, onFavorite, onContext }: {
  note: Note;
  preview: string;
  selected: boolean;
  deletedView?: boolean;
  folderLabel: string;
  onSelect: () => void;
  onOpen: () => void;
  onDelete: () => void;
  onFavorite: () => void;
  onContext: (event: React.MouseEvent) => void;
}) {
  const cardRef = useRef<HTMLElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState({ width: 320, height: 182 });
  const [textWidth, setTextWidth] = useState(0);
  const displayTitle = (note.title || "新建学习笔记").replace(/\s+/g, " ").trim() || "新建学习笔记";

  useLayoutEffect(() => {
    const element = cardRef.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width && rect.height) setSize({ width: rect.width, height: rect.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (measureRef.current) setTextWidth(measureRef.current.getBoundingClientRect().width);
  }, [displayTitle, size.width]);

  const tabWidth = Math.max(
    size.width * 0.3,
    Math.min(textWidth + TAB_PADDING, size.width * 0.6, size.width - 96),
  );

  return (
    <article
      ref={cardRef}
      className={`tmi-note effie-note-card ${selected ? "is-selected" : ""} ${note.pinned ? "is-pinned" : ""}`}
      data-testid={`note-card-${note.id}`}
      onClick={onSelect}
      onDoubleClick={() => !deletedView && onOpen()}
      onContextMenu={onContext}
    >
      <svg className="effie-card-outline" viewBox={`0 0 ${Math.max(160, size.width)} ${Math.max(120, size.height)}`} preserveAspectRatio="none" aria-hidden="true">
        <path d={outlinePath(size.width, size.height, tabWidth)} />
      </svg>
      <span ref={measureRef} className="effie-card-tab-measure" style={{ font: TAB_FONT }} aria-hidden="true">{displayTitle}</span>
      <div className="effie-card-tab" style={{ width: tabWidth }} title={displayTitle}>
        <span className="effie-card-tab-label">{displayTitle}</span>
      </div>
      <button className={`note-heart ${note.favorite ? "is-favorite" : ""}`} onClick={(event) => { event.stopPropagation(); onFavorite(); }} aria-label={note.favorite ? "取消收藏" : "收藏"}>{note.favorite ? "♥" : "♡"}</button>
      <div className="effie-card-content">
        <div className="effie-card-title tmi-note-title">{displayTitle}</div>
        <div className="effie-card-preview tmi-note-preview">{preview || "还没有内容，打开后开始学习。"}</div>
        <div className="effie-card-divider" aria-hidden="true" />
        <div className="effie-card-footer"><span><Icon name="clock" /> {new Date(note.updatedAt).toLocaleDateString("zh-CN")}</span><span>{folderLabel}</span></div>
        {!deletedView && <button className="river-test-open" onClick={(event) => { event.stopPropagation(); onOpen(); }}>打开</button>}
        {!deletedView && <button className="river-test-delete" onClick={(event) => { event.stopPropagation(); onDelete(); }}>删除</button>}
      </div>
    </article>
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
          <EffieNoteCard
            key={note.id}
            note={note}
            preview={previews[note.id] || ""}
            selected={selectedNoteId === note.id}
            deletedView={deletedView}
            folderLabel={folderName(note.folderId)}
            onSelect={() => onSelect(note.id)}
            onOpen={() => onOpen(note.id)}
            onDelete={() => props.onDelete(note.id)}
            onFavorite={() => props.onFavorite(note.id)}
            onContext={context(note)}
          />
        ))}
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.note)} onClose={() => setMenu(null)} />}
      {moveDialog}
    </>
  );
}
