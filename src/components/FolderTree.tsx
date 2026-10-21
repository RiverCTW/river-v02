import { useMemo, useState } from "react";
import type { Folder } from "../types";
import { FolderIcon } from "./IconSprite";

interface FolderTreeProps {
  folders: Folder[];
  selectedFolderId: string | null;
  onSelect: (folderId: string | null) => void;
  onCreate: (parentId: string | null) => void;
  onContextMenu: (folder: Folder, event: React.MouseEvent) => void;
  onMoveFolder: (folderId: string, parentId: string | null, order: number) => Promise<void>;
}

interface FolderNode extends Folder { children: FolderNode[] }
type DropPlacement = "before" | "inside" | "after";

export function FolderTree({ folders, selectedFolderId, onSelect, onCreate, onContextMenu, onMoveFolder }: FolderTreeProps) {
  const activeFolders = useMemo(() => folders.filter((folder) => !folder.deletedAt), [folders]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(activeFolders.filter((folder) => !folder.parentId).map((folder) => folder.id)));
  const [dropTarget, setDropTarget] = useState<{ id: string | "root"; placement: DropPlacement } | null>(null);

  const roots = useMemo(() => {
    const map = new Map<string, FolderNode>();
    activeFolders.forEach((folder) => map.set(folder.id, { ...folder, children: [] }));
    const result: FolderNode[] = [];
    map.forEach((folder) => {
      if (folder.parentId && map.has(folder.parentId)) map.get(folder.parentId)!.children.push(folder);
      else result.push(folder);
    });
    const sort = (items: FolderNode[]) => {
      items.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
      items.forEach((item) => sort(item.children));
    };
    sort(result);
    return result;
  }, [activeFolders]);

  const toggle = (folderId: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(folderId)) next.delete(folderId); else next.add(folderId);
    return next;
  });

  const move = async (event: React.DragEvent, target: FolderNode | null, placement: DropPlacement) => {
    event.preventDefault();
    const folderId = event.dataTransfer.getData("application/x-river-folder");
    setDropTarget(null);
    if (!folderId) return;
    if (!target) { await onMoveFolder(folderId, null, roots.length); return; }
    if (target.id === folderId) return;
    if (placement === "inside") await onMoveFolder(folderId, target.id, target.children.length);
    else await onMoveFolder(folderId, target.parentId, target.order + (placement === "after" ? 1 : 0));
    setExpanded((current) => new Set(current).add(target.id));
  };

  const renderNode = (node: FolderNode, depth = 0) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expanded.has(node.id);
    const placement = dropTarget?.id === node.id ? dropTarget.placement : null;
    return (
      <div key={node.id} className="tmi-folder-branch">
        <div
          className={`tmi-tree-folder ${selectedFolderId === node.id ? "is-open" : ""} ${placement ? `is-drop-${placement}` : ""}`}
          style={{ paddingLeft: 6 + depth * 14 }}
          data-testid={`folder-${node.id}`}
          draggable
          onDragStart={(event) => { event.dataTransfer.setData("application/x-river-folder", node.id); event.dataTransfer.effectAllowed = "move"; }}
          onDragOver={(event) => {
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            const ratio = (event.clientY - rect.top) / rect.height;
            setDropTarget({ id: node.id, placement: ratio < 0.25 ? "before" : ratio > 0.75 ? "after" : "inside" });
          }}
          onDragLeave={() => setDropTarget((current) => current?.id === node.id ? null : current)}
          onDrop={(event) => void move(event, node, placement || "inside")}
          onClick={() => onSelect(node.id)}
          onDoubleClick={(event) => onContextMenu(node, event)}
          onContextMenu={(event) => { event.preventDefault(); onContextMenu(node, event); }}
        >
          <button className="tmi-chevron" onClick={(event) => { event.stopPropagation(); if (hasChildren) toggle(node.id); }} aria-label={isExpanded ? "折叠文件夹" : "展开文件夹"}>
            {hasChildren ? (isExpanded ? "⌄" : "›") : "·"}
          </button>
          <FolderIcon />
          <span className="tmi-tree-label">{node.name}</span>
          <button className="tmi-folder-add" title="添加子文件夹" onClick={(event) => { event.stopPropagation(); onCreate(node.id); }}>+</button>
        </div>
        {hasChildren && isExpanded && node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div
      className={`tmi-tree ${dropTarget?.id === "root" ? "is-drop-root" : ""}`}
      onDragOver={(event) => { event.preventDefault(); setDropTarget({ id: "root", placement: "inside" }); }}
      onDrop={(event) => void move(event, null, "inside")}
    >
      {roots.length === 0 ? <div className="river-muted" style={{ fontSize: 10, padding: 6 }}>还没有文件夹</div> : roots.map((node) => renderNode(node))}
    </div>
  );
}
