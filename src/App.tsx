import { useEffect, useState } from "react";
import { IconSprite } from "./components/IconSprite";
import { LibraryView } from "./components/LibraryView";
import { KnowledgeEditor } from "./components/KnowledgeEditor";
import { SettingsModal } from "./components/SettingsModal";
import { SharedNoteView } from "./components/SharedNoteView";
import { Toast } from "./components/Toast";
import { LoginPage } from "./components/LoginPage";
import { LocalWorkspaceChoice } from "./components/LocalWorkspaceChoice";
import { AdminUsersModal } from "./components/AdminUsersModal";
import { useAppStore } from "./store/useAppStore";
import { flushActiveEditor } from "./editor/editorFlush";
import { getCurrentUser, logout as logoutRequest } from "./services/authClient";
import { adoptLocalWorkspace, clearLocalWorkspace, flushWorkspace, loadWorkspaceForUser, onWorkspaceSyncState, startEmptyWorkspace } from "./services/workspaceSync";
import type { AuthUser } from "./types";

export function App() {
  const bootstrap = useAppStore((state) => state.bootstrap);
  const bootstrapped = useAppStore((state) => state.bootstrapped);
  const bundle = useAppStore((state) => state.bundle);
  const uiStyle = useAppStore((state) => state.uiStyle);
  const setUIStyle = useAppStore((state) => state.setUIStyle);
  const createNoteAction = useAppStore((state) => state.createNoteAction);
  const openNote = useAppStore((state) => state.openNote);
  const closeNote = useAppStore((state) => state.closeNote);
  const saveStatus = useAppStore((state) => state.saveStatus);
  const saveError = useAppStore((state) => state.saveError);
  const showToast = useAppStore((state) => state.showToast);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [leavingNote, setLeavingNote] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [needsWorkspaceChoice, setNeedsWorkspaceChoice] = useState(false);
  const [workspaceError, setWorkspaceError] = useState("");
  const [syncState, setSyncState] = useState("idle");
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
    getCurrentUser().then(setUser).catch(() => setUser(null)).finally(() => setAuthReady(true));
  }, []);

  useEffect(() => {
    const unsubscribe = onWorkspaceSyncState((state) => setSyncState(state));
    return () => { unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!user) return;
    if (import.meta.env.VITE_E2E_LOCAL_ONLY === "1") {
      setWorkspaceReady(true);
      return;
    }
    let cancelled = false;
    setWorkspaceReady(false);
    loadWorkspaceForUser(user.id).then(async (workspace) => {
      if (cancelled) return;
      if (workspace.payload) {
        setNeedsWorkspaceChoice(false);
        setWorkspaceReady(true);
        return;
      }
      // A brand-new server account can safely start empty without a choice.
      const { db } = await import("./db/database");
      const noteCount = await db.notes.count();
      if (noteCount === 0) {
        await startEmptyWorkspace(user.id);
        if (!cancelled) setWorkspaceReady(true);
      } else if (!cancelled) {
        setNeedsWorkspaceChoice(true);
      }
    }).catch((error) => {
      console.error("River workspace initialization failed", error);
      if (!cancelled) setWorkspaceError(error instanceof Error ? error.message : "工作区初始化失败。");
    });
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    if (user && workspaceReady && !bootstrapped) void bootstrap();
  }, [user, workspaceReady, bootstrapped, bootstrap]);

  if (sharedShareId) return <SharedNoteView shareId={decodeURIComponent(sharedShareId)} />;

  if (!authReady) return <div id="river-app" className="river-app-shell"><div className="river-empty">正在连接 River…</div></div>;
  if (!user) return <LoginPage onLogin={(nextUser) => setUser(nextUser)} />;
  if (needsWorkspaceChoice) {
    return <LocalWorkspaceChoice
      onAdopt={async () => { await adoptLocalWorkspace(user.id); setNeedsWorkspaceChoice(false); setWorkspaceReady(true); }}
      onEmpty={async () => { await clearLocalWorkspace(); await startEmptyWorkspace(user.id); setNeedsWorkspaceChoice(false); setWorkspaceReady(true); }}
    />;
  }
  if (workspaceError) return <div id="river-app" className="river-app-shell"><div className="river-empty">River 工作区初始化失败：{workspaceError}</div></div>;

  if (!bootstrapped || !workspaceReady) {
    return <div id="river-app" className="river-app-shell"><div className="river-empty">正在打开 River…</div></div>;
  }

  const logout = async () => {
    await flushActiveEditor();
    await flushWorkspace().catch(() => undefined);
    await logoutRequest();
    await clearLocalWorkspace();
    window.location.reload();
  };

  return (
    <div id="river-app" className="river-app-shell">
      <IconSprite />
      <header className="river-topbar">
        <div className="river-brand">
          <div className="river-brand-mark">R</div>
          <div>
            <div className="river-brand-title">River</div>
            <div className="river-brand-subtitle">AI 伴随学习 · v0.2</div>
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
          <span className="river-user-chip">{user.username}</span>
          {user.role === "admin" && <button className="river-button" onClick={() => setAdminOpen(true)}>账号管理</button>}
          <button className="river-button" onClick={() => setSettingsOpen(true)}>设置 / API Key</button>
          <button className="river-button" onClick={() => void logout()}>退出</button>
        </div>
      </header>
      <div className={`river-sync-state is-${syncState}`}>{syncState === "syncing" ? "正在同步…" : syncState === "conflict" ? "同步冲突" : syncState === "offline" ? "离线草稿" : syncState === "error" ? "同步失败" : "已同步"}</div>
      <main className="river-main">
        {bundle ? <KnowledgeEditor /> : <LibraryView />}
      </main>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {adminOpen && <AdminUsersModal onClose={() => setAdminOpen(false)} />}
      <Toast />
    </div>
  );
}
