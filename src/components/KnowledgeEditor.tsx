import { useEffect, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { OutlineEditor } from "../editor/OutlineEditor";
import { FolderIcon } from "./IconSprite";
import { PreferenceCard } from "./PreferenceCard";
import { CompanionPanel } from "./CompanionPanel";
import { ResizableSplit } from "./ResizableSplit";

export function KnowledgeEditor() {
  const bundle = useAppStore((state) => state.bundle);
  const folders = useAppStore((state) => state.folders);
  const updateNoteTitleAction = useAppStore((state) => state.updateNoteTitleAction);
  const updateBundleTree = useAppStore((state) => state.updateBundleTree);
  const focusMode = useAppStore((state) => state.focusMode);
  const toggleFocusMode = useAppStore((state) => state.toggleFocusMode);
  const saveStatus = useAppStore((state) => state.saveStatus);
  const saveError = useAppStore((state) => state.saveError);
  const closeNote = useAppStore((state) => state.closeNote);
  const [title, setTitle] = useState(bundle?.note.title || "");

  useEffect(() => { setTitle(bundle?.note.title || ""); }, [bundle?.note.title]);
  if (!bundle) return null;

  const folderName = folders.find((folder) => folder.id === bundle.note.folderId)?.name || "根目录";
  const navigateFolder = () => {
    if (bundle.note.folderId) sessionStorage.setItem("river.library.folder", bundle.note.folderId);
    closeNote();
  };

  const main = (
    <section className="river-editor-main river-v02-note-main">
      <header className="river-note-header river-editor-toolbar">
        <div className="river-note-location">
          <FolderIcon />
          <input className="river-note-title-input" value={title} onChange={(event) => setTitle(event.target.value)} onBlur={() => void updateNoteTitleAction(title.trim() || "未命名笔记")} aria-label="笔记标题" />
          <span>/</span>
          <button onClick={navigateFolder}>{folderName}</button>
        </div>
        <div className="river-note-header-actions"><span className={`river-badge ${saveStatus === "error" ? "error" : ""}`}>{saveStatus === "saving" ? "保存中…" : saveStatus === "saved" ? "已保存" : saveStatus === "error" ? `保存失败：${saveError || ""}` : "自动保存"}</span></div>
      </header>
      <PreferenceCard />
      <div className="river-main-editor-region">
        <OutlineEditor
          instanceId={`main:${bundle.note.id}`}
          bundle={bundle}
          focusMode={focusMode}
          onToggleFocus={toggleFocusMode}
          onChange={(nodes, blocks, editorDoc) => updateBundleTree(bundle.note.id, nodes, blocks, editorDoc)}
        />
      </div>
    </section>
  );

  if (focusMode) return <div className="river-editor-layout river-v02-note-layout is-focus">{main}</div>;

  return (
    <div className="river-editor-layout river-v02-note-layout">
      <ResizableSplit
        direction="horizontal"
        storageKey={`river.split.main.v3.${bundle.note.id}`}
        defaultPercent={67}
        minFirst={560}
        minSecond={420}
        first={main}
        second={<CompanionPanel noteId={bundle.note.id} />}
      />
    </div>
  );
}
