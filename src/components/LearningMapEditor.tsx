import { useEffect, useState } from "react";
import { db } from "../db/database";
import type { LearningMap, LearningMapKind } from "../types";
import { useAppStore } from "../store/useAppStore";
import { OutlineEditor } from "../editor/OutlineEditor";
import { nodesToTiptap } from "../editor/convert";

export function LearningMapEditor({ noteId, activeKind }: { noteId: string; activeKind: LearningMapKind }) {
  const note = useAppStore((state) => state.bundle?.note);
  const mainBundle = useAppStore((state) => state.bundle);
  const updateBundleTree = useAppStore((state) => state.updateBundleTree);
  const showToast = useAppStore((state) => state.showToast);
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
    if (next.syncEnabled && mainBundle?.note.id === noteId) {
      const byAnchor = new Map(next.nodes.flatMap((node) => node.sourceRefs?.map((ref) => [ref.quote || "", node.title] as const) || []).filter(([anchor]) => anchor));
      let changed = false;
      const syncedNodes = mainBundle.nodes.map((node) => {
        if (node.userModified) return node;
        const title = node.sourceRefs?.map((ref) => byAnchor.get(ref.quote || "")).find(Boolean);
        if (!title || title === node.title) return node;
        changed = true;
        return { ...node, title, updatedAt: new Date().toISOString() };
      });
      if (changed) {
        await updateBundleTree(noteId, syncedNodes, mainBundle.blocks, nodesToTiptap(syncedNodes, mainBundle.blocks));
        showToast("已同步明确关联的标题；个人答案未被修改。", "info");
      }
    }
  };

  return (
    <div className="river-learning-map-editors">
      {(["requirements", "questions"] as LearningMapKind[]).map((kind) => {
        const map = maps[kind];
        return (
          <div key={kind} className={`river-learning-map-instance ${activeKind === kind ? "is-active" : ""}`}>
            {!map ? <div className="river-empty">生成知识树后，这里会同时得到{kind === "requirements" ? "要求式" : "问题式"}学习地图。</div> : note ? (
              <OutlineEditor
                instanceId={`map:${noteId}:${kind}`}
                bundle={{ note: { ...note, id: `${noteId}:${kind}`, title: map.kind === "requirements" ? "要求式学习地图" : "问题式学习地图", editorDoc: map.editorDoc }, nodes: map.nodes, blocks: map.blocks, sources: [] }}
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
