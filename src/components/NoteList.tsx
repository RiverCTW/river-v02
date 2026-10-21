import { useEffect, useMemo, useState } from "react";
import { db } from "../db/database";
import type { Folder, Note, UIStyle } from "../types";
import { FolderIcon, Icon } from "./IconSprite";

interface NoteListProps {
  notes: Note[];
  folders: Folder[];
  selectedNoteId: string | null;
  uiStyle: UIStyle;
  onSelect: (noteId: string) => void;
  onOpen: (noteId: string) => void;
  onDelete: (noteId: string) => void;
  onMove: (noteId: string, folderId: string | null) => void;
}

export function NoteList({ notes, folders, selectedNoteId, uiStyle, onSelect, onOpen, onDelete, onMove }: NoteListProps) {
  const [previews, setPreviews] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    if (!notes.length) {
      setPreviews({});
      return;
    }
    db.blocks.where("noteId").anyOf(notes.map((note) => note.id)).toArray().then((blocks) => {
      if (cancelled) return;
      const map: Record<string, string> = {};
      blocks
        .sort((a, b) => a.order - b.order)
        .forEach((block) => {
          if (!map[block.noteId] && block.text.trim()) map[block.noteId] = block.text.replace(/\n+/g, " ").slice(0, 92);
        });
      setPreviews(map);
    });
    return () => { cancelled = true; };
  }, [notes]);

  const sortedNotes = useMemo(() => [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [notes]);

  if (uiStyle === "notability") {
    return (
      <div className="tmi-paper-grid">
        {sortedNotes.map((note) => (
          <div className="tmi-paper-item" key={note.id}>
            <article
              className={`tmi-paper-sheet ${selectedNoteId === note.id ? "is-selected" : ""}`}
              onClick={() => onSelect(note.id)}
              onDoubleClick={() => onOpen(note.id)}
            >
              <div className="tmi-sheet-title">{note.title}</div>
              <div className="tmi-sheet-line">{previews[note.id] || "还没有内容，打开后开始学习。"}</div>
              <div className="tmi-sheet-date">最近修改：{new Date(note.updatedAt).toLocaleDateString("zh-CN")}</div>
            </article>
            <div className="tmi-paper-filename">{note.title}.note</div>
            <div className="river-chip-row" style={{ marginTop: 4 }}>
              <button className="river-chip" style={{ padding: "3px 6px", fontSize: 9 }} onClick={() => onOpen(note.id)}>打开</button>
              <select
                className="river-chip"
                style={{ padding: "2px 4px", fontSize: 9 }}
                value={note.folderId || ""}
                onChange={(event) => onMove(note.id, event.target.value || null)}
                onClick={(event) => event.stopPropagation()}
              >
                <option value="">根目录</option>
                {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
              </select>
              <button className="river-chip" style={{ padding: "3px 6px", fontSize: 9 }} onClick={() => onDelete(note.id)}>删除</button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="tmi-note-list">
      {sortedNotes.map((note) => (
        <article
          className={`tmi-note ${selectedNoteId === note.id ? "is-selected" : ""}`}
          key={note.id}
          onClick={() => onSelect(note.id)}
          onDoubleClick={() => onOpen(note.id)}
        >
          <div className="tmi-file-tab">
            <FolderIcon className="tmi-folder-icon-svg" />
            <span className="tmi-tab-text">{note.title.replace(/\s+/g, "")}</span>
          </div>
          <div className="tmi-note-content">
            <div className="tmi-note-title">{note.title}</div>
            <div className="tmi-note-preview">{previews[note.id] || "还没有内容，打开后开始学习。"}</div>
            <div className="tmi-note-date">
              <Icon name="clock" />
              最近修改：{new Date(note.updatedAt).toLocaleDateString("zh-CN")}
            </div>
            <div className="river-chip-row" style={{ marginTop: 8 }}>
              <button className="river-chip" style={{ padding: "4px 7px", fontSize: 9 }} onClick={(event) => { event.stopPropagation(); onOpen(note.id); }}>打开</button>
              <select
                className="river-chip"
                style={{ padding: "3px 5px", fontSize: 9 }}
                value={note.folderId || ""}
                onChange={(event) => onMove(note.id, event.target.value || null)}
                onClick={(event) => event.stopPropagation()}
              >
                <option value="">根目录</option>
                {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
              </select>
              <button className="river-chip" style={{ padding: "4px 7px", fontSize: 9 }} onClick={(event) => { event.stopPropagation(); onDelete(note.id); }}>删除</button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
