import { useEffect, useState } from "react";
import { IconSprite } from "./components/IconSprite";
import { LibraryView } from "./components/LibraryView";
import { KnowledgeEditor } from "./components/KnowledgeEditor";
import { SettingsModal } from "./components/SettingsModal";
import { SharedNoteView } from "./components/SharedNoteView";
import { Toast } from "./components/Toast";
import { useAppStore } from "./store/useAppStore";
import { flushActiveEditor } from "./editor/editorFlush";

export function App() {
  const bootstrap = useAppStore((state) => state.bootstrap);
  const bootstrapped = useAppStore((state) => state.bootstrapped);
  const bundle = useAppStore((state) => state.bundle);
  const uiStyle = useAppStore((state) => state.uiStyle);
  const setUIStyle = useAppStore((state) => state.setUIStyle);
  const createNoteAction = useAppStore((state) => state.createNoteAction);
  const closeNote = useAppStore((state) => state.closeNote);
  const saveStatus = useAppStore((state) => state.saveStatus);
  const saveError = useAppStore((state) => state.saveError);
  const showToast = useAppStore((state) => state.showToast);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [leavingNote, setLeavingNote] = useState(false);
  const sharedShareId = window.location.pathname.match(/^\/share\/([^/]+)\/?$/)?.[1];

  const returnToLibrary = async () => {
    if (leavingNote) return;
    setLeavingNote(true);
    try {
      await flushActiveEditor();
      if (useAppStore.getState().saveStatus === "error") {
        showToast("最后一次修改尚未保存，已留在当前笔记。", "error");
        return;
      }
      closeNote();
    } finally {
      setLeavingNote(false);
    }
  };

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  if (sharedShareId) return <SharedNoteView shareId={decodeURIComponent(sharedShareId)} />;

  if (!bootstrapped) {
    return <div id="river-app" className="river-app-shell"><div className="river-empty">正在打开 River…</div></div>;
  }

  return (
    <div id="river-app" className="river-app-shell">
      <IconSprite />
      <header className="river-topbar">
        <div className="river-brand">
          <div className="river-brand-mark">R</div>
          <div>
            <div className="river-brand-title">River</div>
            <div className="river-brand-subtitle">AI 伴随学习 · v0.1</div>
          </div>
        </div>
        <div className="river-topbar-actions">
          {bundle ? (
            <>
              <button className="river-button" onClick={() => { void returnToLibrary(); }} disabled={leavingNote}>
                {leavingNote ? "保存中…" : "返回笔记库"}
              </button>
              <span className="river-badge">
                {saveStatus === "saving" ? "保存中…" : saveStatus === "saved" ? "已保存" : saveStatus === "error" ? `保存失败：${saveError || ""}` : "自动保存"}
              </span>
            </>
          ) : (
            <>
              <button className="river-button" onClick={() => createNoteAction(null)}>新建笔记</button>
              <div className="river-chip-row">
                <button className={`river-chip ${uiStyle === "effie" ? "selected" : ""}`} onClick={() => setUIStyle("effie")}>Effie 风格</button>
                <button className={`river-chip ${uiStyle === "notability" ? "selected" : ""}`} onClick={() => setUIStyle("notability")}>Notability 风格</button>
              </div>
            </>
          )}
          <button className="river-button" onClick={() => setSettingsOpen(true)}>设置 / API Key</button>
        </div>
      </header>
      <main className="river-main">
        {bundle ? <KnowledgeEditor /> : <LibraryView />}
      </main>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      <Toast />
    </div>
  );
}
