import { useMemo, useState } from "react";
import type { Folder } from "../types";
import { FolderIcon, Icon } from "./IconSprite";

interface FolderTreeProps {
  folders: Folder[];
  selectedFolderId: string | null;
  onSelect: (folderId: string | null) => void;
  onCreate: (parentId: string | null) => void;
  onRename: (folder: Folder) => void;
  onDelete: (folder: Folder) => void;
}

interface FolderNode extends Folder {
  children: FolderNode[];
}

export function FolderTree({ folders, selectedFolderId, onSelect, onCreate, onRename, onDelete }: FolderTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(folders.filter((folder) => !folder.parentId).map((folder) => folder.id)));

  const roots = useMemo(() => {
    const map = new Map<string, FolderNode>();
    folders.forEach((folder) => map.set(folder.id, { ...folder, children: [] }));
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
  }, [folders]);

  const toggle = (folderId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const renderNode = (node: FolderNode, depth = 0) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expanded.has(node.id);
    return (
      <div key={node.id}>
        <div
          className={`tmi-tree-folder ${selectedFolderId === node.id ? "is-open" : ""}`}
          style={{ marginLeft: depth * 14, cursor: "pointer" }}
          onClick={() => onSelect(node.id)}
          onDoubleClick={() => onRename(node)}
        >
          <button
            className="tmi-chevron"
            style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer" }}
            onClick={(event) => { event.stopPropagation(); if (hasChildren) toggle(node.id); }}
            aria-label={isExpanded ? "折叠文件夹" : "展开文件夹"}
          >
            {hasChildren ? (isExpanded ? "⌄" : "›") : "·"}
          </button>
          <FolderIcon />
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.name}</span>
          <button
            className="river-icon-button"
            style={{ width: 22, height: 22, border: 0, background: "transparent", opacity: 0.7 }}
            title="新建子文件夹"
            onClick={(event) => { event.stopPropagation(); onCreate(node.id); }}
          >
            +
          </button>
          <button
            className="river-icon-button"
            style={{ width: 22, height: 22, border: 0, background: "transparent", opacity: 0.7 }}
            title="删除文件夹"
            onClick={(event) => { event.stopPropagation(); onDelete(node); }}
          >
            ×
          </button>
        </div>
        {hasChildren && isExpanded && node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="tmi-tree">
      {roots.length === 0 ? (
        <div className="river-muted" style={{ fontSize: 10, padding: 6 }}>还没有文件夹</div>
      ) : roots.map((node) => renderNode(node))}
    </div>
  );
}
