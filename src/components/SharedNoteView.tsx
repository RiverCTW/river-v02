import { useEffect, useMemo, useState } from "react";
import { nanoid } from "nanoid";
import { db } from "../db/database";
import { useAppStore } from "../store/useAppStore";
import { blockTypeLabels, type ContentBlock, type KnowledgeNode, type LearningIntroduction, type LearningProfile } from "../types";
import { Icon, IconSprite } from "./IconSprite";

interface SharedSnapshot {
  note: { title: string };
  profile?: LearningProfile;
  introduction?: LearningIntroduction;
  nodes: KnowledgeNode[];
  blocks: ContentBlock[];
}

export function SharedNoteView({ shareId }: { shareId: string }) {
  const [snapshot, setSnapshot] = useState<SharedSnapshot | null>(null);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const refreshLibrary = useAppStore((state) => state.refreshLibrary);
  const openNote = useAppStore((state) => state.openNote);

  useEffect(() => {
    let cancelled = false;
    fetch(`/shared/${encodeURIComponent(shareId)}.json`)
      .then((response) => {
        if (!response.ok) throw new Error("分享内容不存在或已经失效。");
        return response.json() as Promise<SharedSnapshot>;
      })
      .then((data) => { if (!cancelled) setSnapshot(data); })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "分享内容加载失败。"); });
    return () => { cancelled = true; };
  }, [shareId]);

  const children = useMemo(() => {
    const map = new Map<string | null, KnowledgeNode[]>();
    (snapshot?.nodes || []).forEach((node) => {
      const list = map.get(node.parentId) || [];
      list.push(node);
      map.set(node.parentId, list);
    });
    map.forEach((list) => list.sort((a, b) => a.order - b.order));
    return map;
  }, [snapshot]);

  const blocksByNode = useMemo(() => {
    const map = new Map<string, ContentBlock[]>();
    (snapshot?.blocks || []).forEach((block) => {
      const list = map.get(block.nodeId) || [];
      list.push(block);
      map.set(block.nodeId, list);
    });
    map.forEach((list) => list.sort((a, b) => a.order - b.order));
    return map;
  }, [snapshot]);

  const importToRiver = async () => {
    if (!snapshot) return;
    setImporting(true);
    const noteId = nanoid();
    const now = new Date().toISOString();
    const idMap = new Map(snapshot.nodes.map((node) => [node.id, nanoid()]));
    const note = { id: noteId, folderId: null, title: snapshot.note.title, uiStyle: "effie" as const, createdAt: now, updatedAt: now, deletedAt: null };
    const nodes = snapshot.nodes.map((node) => ({
      ...node,
      id: idMap.get(node.id) || nanoid(),
      noteId,
      parentId: node.parentId ? idMap.get(node.parentId) || null : null,
      createdAt: now,
      updatedAt: now,
    }));
    const blocks = snapshot.blocks.map((block) => ({
      ...block,
      id: nanoid(),
      noteId,
      nodeId: idMap.get(block.nodeId) || nodes[0]?.id || "",
      createdAt: now,
      updatedAt: now,
    })).filter((block) => block.nodeId);
    await db.transaction("rw", db.notes, db.profiles, db.introductions, db.nodes, db.blocks, async () => {
      await db.notes.add(note);
      if (snapshot.profile) await db.profiles.add({ ...snapshot.profile, noteId, createdAt: now, updatedAt: now });
      if (snapshot.introduction) await db.introductions.add({ ...snapshot.introduction, noteId, generatedAt: now });
      await db.nodes.bulkAdd(nodes);
      await db.blocks.bulkAdd(blocks);
    });
    await refreshLibrary();
    await openNote(noteId);
    setImporting(false);
  };

  if (error) return <div id="river-app" className="river-app-shell"><div className="river-empty">{error}</div></div>;
  if (!snapshot) return <div id="river-app" className="river-app-shell"><div className="river-empty">正在加载分享笔记…</div></div>;

  const renderNodes = (parentId: string | null) => (
    <ul className={`shared-outline ${parentId ? "is-child" : ""}`}>
      {(children.get(parentId) || []).map((node) => (
        <li key={node.id} className={`shared-node shared-heading-${node.headingLevel ?? 0}`}>
          <div className="shared-node-title"><span className="shared-bullet" />{renderSemanticText(node.title)}</div>
          <div className="shared-node-blocks">
            {(blocksByNode.get(node.id) || []).map((block) => (
              <div className="shared-block" key={block.id}>
                <span className="shared-block-type">{blockTypeLabels[block.type]}</span>
                <span>{renderSemanticText(block.text)}</span>
              </div>
            ))}
          </div>
          {renderNodes(node.id)}
        </li>
      ))}
    </ul>
  );

  return (
    <div id="river-app" className="river-app-shell shared-page">
      <IconSprite />
      <header className="shared-header">
        <div>
          <div className="shared-brand"><span>R</span> River 分享笔记</div>
          <h1>{snapshot.note.title}</h1>
        </div>
        <button className="river-button primary" onClick={importToRiver} disabled={importing}>
          <Icon name="library" />
          {importing ? "导入中…" : "导入到我的 River"}
        </button>
      </header>
      <main className="shared-canvas">
        {snapshot.introduction && (
          <section className="shared-intro">
            <h2>学习定位</h2>
            <p>{snapshot.introduction.positioning}</p>
            {snapshot.introduction.goalQuestions.length > 0 && (
              <>
                <h3>导入问题</h3>
                <ol>{snapshot.introduction.goalQuestions.map((question, index) => <li key={index}>{question}</li>)}</ol>
              </>
            )}
            {snapshot.introduction.mapSections.length > 0 && (
              <>
                <h3>本章目录</h3>
                <div className="shared-map">
                  {snapshot.introduction.mapSections.map((section) => (
                    <div className="shared-map-row" key={section.id}>
                      <b>{section.title}</b>
                      <span>{section.summary}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        )}
        {renderNodes(null)}
      </main>
    </div>
  );
}

function renderSemanticText(text: string) {
  const parts = text.split(/(\*\*.*?\*\*|\+\+.*?\+\+|\*.*?\*|~~.*?~~)/g).filter(Boolean);
  return parts.map((part, index) => {
    if ((part.startsWith("**") || part.startsWith("++")) && part.length > 4) return <span className="river-semantic-pink" key={index}>{part}</span>;
    if (part.startsWith("~~") && part.endsWith("~~")) return <span className="river-semantic-strike" key={index}>{part}</span>;
    if (part.startsWith("*") && part.endsWith("*")) return <span className="river-semantic-gold" key={index}>{part}</span>;
    return <span key={index}>{part}</span>;
  });
}
