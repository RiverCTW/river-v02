import { useEffect, useRef, useState } from "react";
import type { LearningMapKind } from "../types";
import { useAppStore } from "../store/useAppStore";
import { LearningMapEditor } from "./LearningMapEditor";
import { ChatPanel } from "./ChatPanel";
import { ResizableSplit } from "./ResizableSplit";
import { Icon } from "./IconSprite";

export function CompanionPanel({ noteId }: { noteId: string }) {
  const bundle = useAppStore((state) => state.bundle);
  const attachCourseware = useAppStore((state) => state.attachCourseware);
  const deleteSourceAction = useAppStore((state) => state.deleteSourceAction);
  const reorderSourcesAction = useAppStore((state) => state.reorderSourcesAction);
  const [activeKind, setActiveKind] = useState<LearningMapKind>("requirements");
  const [dragActive, setDragActive] = useState(false);
  const [materialsCollapsed, setMaterialsCollapsed] = useState(false);
  const storageKey = `river.materials.collapsed.${noteId}`;
  const inputRef = useRef<HTMLInputElement>(null);
  const locked = Boolean(bundle?.note.sourcesLockedAt || bundle?.note.generationState === "completed");
  const sources = bundle?.sources?.length ? bundle.sources : bundle?.source ? [bundle.source] : [];

  useEffect(() => {
    setMaterialsCollapsed(localStorage.getItem(storageKey) === "true");
  }, [storageKey]);

  const toggleMaterials = () => {
    setMaterialsCollapsed((current) => {
      localStorage.setItem(storageKey, String(!current));
      return !current;
    });
  };

  const uploadFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) await attachCourseware(file);
  };

  const moveSource = async (index: number, direction: -1 | 1) => {
    const next = [...sources];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    await reorderSourcesAction(next.map((source) => source.id));
  };

  return (
    <aside className="river-editor-side river-companion-panel">
      <div className={`river-companion-top ${materialsCollapsed ? "is-collapsed" : ""}`}>
      <section className={`river-materials-panel ${materialsCollapsed ? "is-collapsed" : ""}`}>
        <div className="river-companion-heading">
          <div><div className="river-overline">学习资料</div><b>{sources.length ? `${sources.length} 份资料` : "添加课件"}</b></div>
          <div className="river-materials-actions">
            {locked && <span className="river-badge">已锁定</span>}
            <button type="button" className="river-materials-toggle" aria-expanded={!materialsCollapsed} onClick={toggleMaterials}>
              {materialsCollapsed ? "展开" : "收起"}
            </button>
          </div>
        </div>
        {!locked && <div className={`river-companion-dropzone ${dragActive ? "is-drag" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragActive(true); }} onDragLeave={() => setDragActive(false)} onDrop={(event) => { event.preventDefault(); setDragActive(false); void uploadFiles(event.dataTransfer.files); }} onClick={() => inputRef.current?.click()}>
          <Icon name="notebook" /><span>拖动或选择 PDF / PPTX</span>
          <input ref={inputRef} hidden multiple type="file" accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={(event) => { if (event.target.files) void uploadFiles(event.target.files); event.target.value = ""; }} />
        </div>}
        <div className="river-source-list">
          {sources.map((source, index) => <div className="river-source-item" key={source.id}>
            <span className="river-source-type">{source.kind.toUpperCase()}</span>
            <div><b title={source.fileName}>{source.fileName}</b><small>{source.parseStatus === "parsed" ? "解析完成" : source.parseStatus === "partial" ? "部分解析" : source.parseStatus === "failed" ? "解析失败" : "解析中"} · {source.textCharCount} 字符</small></div>
            {!locked && <div className="river-source-actions"><button disabled={index === 0} onClick={() => void moveSource(index, -1)}>↑</button><button disabled={index === sources.length - 1} onClick={() => void moveSource(index, 1)}>↓</button><button onClick={() => void deleteSourceAction(source.id)}>×</button></div>}
          </div>)}
        </div>
      </section>

      <div className="river-map-switch" role="tablist">
        <button role="tab" aria-selected={activeKind === "requirements"} className={activeKind === "requirements" ? "selected" : ""} onClick={() => setActiveKind("requirements")}>学习目标式学习地图</button>
        <button role="tab" aria-selected={activeKind === "questions"} className={activeKind === "questions" ? "selected" : ""} onClick={() => setActiveKind("questions")}>问题式学习地图</button>
      </div>

      </div>

      <div className="river-companion-workarea">
        <ResizableSplit
          direction="vertical"
          storageKey={`river.split.companion.v3.${noteId}`}
          defaultPercent={75}
          minFirst={0}
          minSecond={180}
          first={<LearningMapEditor noteId={noteId} activeKind={activeKind} />}
          second={<ChatPanel noteId={noteId} />}
        />
      </div>
    </aside>
  );
}
