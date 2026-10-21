import { useEffect, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { db } from "../db/database";
import { OutlineEditor } from "../editor/OutlineEditor";
import { FolderIcon } from "./IconSprite";
import { AIResultPreview, OnboardingWizard } from "./OnboardingWizard";

export function KnowledgeEditor() {
  const bundle = useAppStore((state) => state.bundle);
  const updateNoteTitleAction = useAppStore((state) => state.updateNoteTitleAction);
  const updateBundleTree = useAppStore((state) => state.updateBundleTree);
  const focusMode = useAppStore((state) => state.focusMode);
  const toggleFocusMode = useAppStore((state) => state.toggleFocusMode);
  const saveStatus = useAppStore((state) => state.saveStatus);
  const saveError = useAppStore((state) => state.saveError);
  const [title, setTitle] = useState(bundle?.note.title || "");

  useEffect(() => {
    setTitle(bundle?.note.title || "");
  }, [bundle?.note.title]);

  if (!bundle) return null;

  return (
    <div className={`river-editor-layout ${focusMode ? "is-focus" : ""}`}>
      <section className="river-editor-main river-panel">
        <div className="river-editor-toolbar">
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
            <FolderIcon />
            <input
              className="river-input"
              style={{ maxWidth: 460, fontWeight: 700 }}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() => updateNoteTitleAction(title.trim() || "未命名笔记")}
            />
          </div>
          <span className={`river-badge ${saveStatus === "error" ? "error" : ""}`}>
            {saveStatus === "saving" ? "保存中…" : saveStatus === "saved" ? "已保存" : saveStatus === "error" ? `保存失败：${saveError || ""}` : "自动保存"}
          </span>
        </div>
        <OutlineEditor
          bundle={bundle}
          onChange={(nodes, blocks, editorDoc) => updateBundleTree(bundle.note.id, nodes, blocks, editorDoc)}
          focusMode={focusMode}
          onToggleFocus={toggleFocusMode}
        />
      </section>
      {!focusMode && (
        <aside className="river-editor-side">
          <OnboardingWizard />
          <AIResultPreview />
          <SourceAndUsage />
        </aside>
      )}
    </div>
  );
}

function SourceAndUsage() {
  const bundle = useAppStore((state) => state.bundle);
  const [usage, setUsage] = useState({ input: 0, output: 0, cost: 0, currency: "USD", count: 0 });
  useEffect(() => {
    if (!bundle) return;
    db.aiRequests.where("noteId").equals(bundle.note.id).toArray().then((records) => {
      const currency = records.find((record) => record.currency)?.currency || "USD";
      setUsage({
        input: records.reduce((sum, record) => sum + record.inputTokens, 0),
        output: records.reduce((sum, record) => sum + record.outputTokens, 0),
        cost: records.reduce((sum, record) => sum + (record.estimatedCost ?? record.estimatedCostUsd ?? 0), 0),
        currency,
        count: records.length,
      });
    });
  }, [bundle]);
  if (!bundle) return null;
  return (
    <div className="river-side-card">
      <h3>课件与 AI 用量</h3>
      {bundle.source ? (
        <div className="river-muted" style={{ fontSize: 11, lineHeight: 1.6 }}>
          {bundle.source.fileName}<br />
          {bundle.source.kind.toUpperCase()} · {bundle.source.pages.length || bundle.source.slides.length} {bundle.source.kind === "pdf" ? "页" : "张幻灯片"} · {bundle.source.parseStatus}
        </div>
      ) : (
        <div className="river-muted" style={{ fontSize: 11 }}>还没有上传课件。</div>
      )}
      <div className="river-muted" style={{ fontSize: 10, marginTop: 8, lineHeight: 1.7 }}>
        AI 请求：{usage.count} 次<br />
        输入 tokens：{usage.input.toLocaleString()}<br />
        输出 tokens：{usage.output.toLocaleString()}<br />
        估算费用：{usage.currency === "CNY" ? "¥" : "$"}{usage.cost.toFixed(4)}
      </div>
    </div>
  );
}
