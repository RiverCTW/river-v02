import { useEffect, useRef, useState } from "react";
import { db } from "../db/database";
import type { LearningMap, LearningMapKind } from "../types";
import { useAppStore } from "../store/useAppStore";
import { LearningMapEditor } from "./LearningMapEditor";
import { ChatPanel } from "./ChatPanel";
import { ResizableSplit } from "./ResizableSplit";
import { ContextMenu } from "./ContextMenu";
import { Icon } from "./IconSprite";

export function CompanionPanel({ noteId }: { noteId: string }) {
  const bundle = useAppStore((state) => state.bundle);
  const attachCourseware = useAppStore((state) => state.attachCourseware);
  const deleteSourceAction = useAppStore((state) => state.deleteSourceAction);
  const reorderSourcesAction = useAppStore((state) => state.reorderSourcesAction);
  const [activeKind, setActiveKind] = useState<LearningMapKind>("requirements");
  const [mapMenu, setMapMenu] = useState<{ x: number; y: number; kind: LearningMapKind } | null>(null);
  const [mapRecords, setMapRecords] = useState<Partial<Record<LearningMapKind, LearningMap>>>({});
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const locked = Boolean(bundle?.note.sourcesLockedAt || bundle?.note.generationState === "completed");
  const sources = bundle?.sources?.length ? bundle.sources : bundle?.source ? [bundle.source] : [];

  useEffect(() => {
    db.learningMaps.where("noteId").equals(noteId).toArray().then((items) => setMapRecords(Object.fromEntries(items.map((item) => [item.kind, item])) as Partial<Record<LearningMapKind, LearningMap>>));
  }, [noteId, bundle?.note.generatedAt]);

  const uploadFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) await attachCourseware(file);
  };

  const toggleSync = async (kind: LearningMapKind) => {
    const map = mapRecords[kind];
    if (!map) return;
    const next = { ...map, syncEnabled: !map.syncEnabled, updatedAt: new Date().toISOString() };
    await db.learningMaps.put(next);
    setMapRecords((current) => ({ ...current, [kind]: next }));
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
      <section className="river-materials-panel">
        <div className="river-companion-heading"><div><div className="river-overline">学习资料</div><b>{sources.length ? `${sources.length} 份资料` : "添加课件"}</b></div>{locked && <span className="river-badge">已锁定</span>}</div>
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
        <button role="tab" aria-selected={activeKind === "requirements"} className={activeKind === "requirements" ? "selected" : ""} onClick={() => setActiveKind("requirements")} onContextMenu={(event) => { event.preventDefault(); setMapMenu({ x: event.clientX, y: event.clientY, kind: "requirements" }); }}>以要求来呈现<br />学习地图</button>
        <button role="tab" aria-selected={activeKind === "questions"} className={activeKind === "questions" ? "selected" : ""} onClick={() => setActiveKind("questions")} onContextMenu={(event) => { event.preventDefault(); setMapMenu({ x: event.clientX, y: event.clientY, kind: "questions" }); }}>以问题来呈现<br />学习地图</button>
      </div>

      <div className="river-companion-workarea">
        <ResizableSplit
          direction="vertical"
          storageKey={`river.split.companion.v3.${noteId}`}
          defaultPercent={75}
          minFirst={260}
          minSecond={180}
          first={<LearningMapEditor noteId={noteId} activeKind={activeKind} />}
          second={<ChatPanel noteId={noteId} />}
        />
      </div>
      {mapMenu && <ContextMenu x={mapMenu.x} y={mapMenu.y} items={[{ id: "sync", label: mapRecords[mapMenu.kind]?.syncEnabled ? "不同步伴随栏笔记" : "同步伴随栏笔记", hint: "个人回答永远保留", action: () => toggleSync(mapMenu.kind) }]} onClose={() => setMapMenu(null)} />}
    </aside>
  );
}
