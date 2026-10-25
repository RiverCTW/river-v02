import { useEffect, useState } from "react";
import { db } from "../db/database";
import type { LearningMap, LearningMapKind } from "../types";
import { useAppStore } from "../store/useAppStore";
import { OutlineEditor } from "../editor/OutlineEditor";

export function LearningMapEditor({ noteId, activeKind }: { noteId: string; activeKind: LearningMapKind }) {
  const note = useAppStore((state) => state.bundle?.note);
  const generatedAt = note?.generatedAt;
  const [maps, setMaps] = useState<Partial<Record<LearningMapKind, LearningMap>>>({});

  useEffect(() => {
    let cancelled = false;
    db.learningMaps.where("noteId").equals(noteId).toArray().then((items) => {
      if (!cancelled) setMaps(Object.fromEntries(items.map((item) => [item.kind, item])) as Partial<Record<LearningMapKind, LearningMap>>);
    });
    return () => { cancelled = true; };
  }, [noteId, generatedAt]);

  const updateMap = async (kind: LearningMapKind, nodes: LearningMap["nodes"], blocks: LearningMap["blocks"], editorDoc: LearningMap["editorDoc"]) => {
    const current = maps[kind];
    if (!current) return;
    const next = { ...current, nodes, blocks, editorDoc, revision: current.revision + 1, updatedAt: new Date().toISOString() };
    setMaps((state) => ({ ...state, [kind]: next }));
    await db.learningMaps.put(next);
  };

  return (
    <div className="river-learning-map-editors">
      {(["requirements", "questions"] as LearningMapKind[]).map((kind) => {
        const map = maps[kind];
        return (
          <div key={kind} className={`river-learning-map-instance ${activeKind === kind ? "is-active" : ""}`}>
            {!map ? <div className="river-empty">生成知识树后，这里会得到{kind === "requirements" ? "学习目标式" : "问题式"}学习地图。</div> : note ? (
              <OutlineEditor
                instanceId={`map:${noteId}:${kind}`}
                bundle={{ note: { ...note, id: `${noteId}:${kind}`, title: map.kind === "requirements" ? "学习目标式学习地图" : "问题式学习地图", editorDoc: map.editorDoc }, nodes: map.nodes, blocks: map.blocks, sources: [] }}
                compact
                focusMode={false}
                onToggleFocus={() => undefined}
                onChange={(nodes, blocks, editorDoc) => void updateMap(kind, nodes, blocks, editorDoc)}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
