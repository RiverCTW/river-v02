import { Node, type Editor } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { closeHistory } from "@tiptap/pm/history";
import { useAppStore } from "../store/useAppStore";

export type RiverImageSize = "thumbnail" | "small" | "medium" | "large";

const SIZE_OPTIONS: Array<{ value: RiverImageSize; label: string }> = [
  { value: "thumbnail", label: "显示为缩略图" },
  { value: "small", label: "显示为小图" },
  { value: "medium", label: "显示为中图" },
  { value: "large", label: "显示为大图" },
];

export const imageWidthPercent: Record<RiverImageSize, number> = {
  thumbnail: 18,
  small: 30,
  medium: 60,
  large: 90,
};

function RiverImageView({ node, editor, getPos, updateAttributes, deleteNode }: NodeViewProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLElement | null>(null);
  const size = (node.attrs.size || "medium") as RiverImageSize;

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
    };
  }, [menuOpen]);

  const imageBlob = async () => {
    const response = await fetch(String(node.attrs.src || ""));
    if (!response.ok) throw new Error("无法读取图片数据。");
    return response.blob();
  };
  const copyImage = async () => {
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
      throw new Error("当前浏览器不支持图片剪贴板写入。");
    }
    const blob = await imageBlob();
    await navigator.clipboard.write([new ClipboardItem({ [blob.type || "image/png"]: blob })]);
  };
  const removeImage = () => {
    const position = getPos();
    if (typeof position === "number" && !editor.isDestroyed) {
      editor.view.dispatch(closeHistory(editor.state.tr));
      editor.chain().focus().deleteRange({ from: position, to: position + node.nodeSize }).run();
      editor.view.dispatch(closeHistory(editor.state.tr));
      return;
    }
    deleteNode();
  };
  const handleCopy = async (cut: boolean) => {
    try {
      await copyImage();
      if (cut) removeImage();
      setMenuOpen(false);
    } catch (error) {
      useAppStore.getState().showToast(error instanceof Error ? error.message : "图片复制失败。", "error");
    }
  };
  const openImage = () => window.open(String(node.attrs.src || ""), "_blank", "noopener,noreferrer");
  const saveImage = () => {
    const anchor = document.createElement("a");
    anchor.href = String(node.attrs.src || "");
    anchor.download = String(node.attrs.alt || "river-image.png");
    anchor.click();
  };
  const pasteImage = async () => {
    try {
      const items = await navigator.clipboard.read();
      const imageItem = items.find((item) => item.types.some((type) => type.startsWith("image/")));
      if (!imageItem) return;
      const type = imageItem.types.find((value) => value.startsWith("image/"));
      if (!type) return;
      const source = await compressImageBlob(await imageItem.getType(type));
      const position = typeof getPos() === "number" ? getPos()! + node.nodeSize : undefined;
      editor.chain().focus().insertContentAt(position ?? editor.state.selection.to, {
        type: "riverImage",
        attrs: { src: source, alt: "粘贴的图片", size: "medium" },
      }).run();
    } catch {
      // Clipboard image support varies by browser; keep the menu non-destructive.
    }
  };

  return (
    <NodeViewWrapper
      as="figure"
      ref={rootRef as any}
      className={`river-image-node is-${size}`}
      data-river-image="true"
      contentEditable={false}
      style={{ width: `${imageWidthPercent[size]}%` }}
      onContextMenu={(event: ReactMouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        setMenuOpen(true);
      }}
    >
      <img src={String(node.attrs.src || "")} alt={String(node.attrs.alt || "")} draggable={false} />
      {menuOpen && (
        <div className="river-image-menu" role="menu" onClick={(event) => event.stopPropagation()}>
          {SIZE_OPTIONS.map((option) => (
            <button type="button" role="menuitemradio" aria-checked={size === option.value} key={option.value} onClick={() => { updateAttributes({ size: option.value }); setMenuOpen(false); }}>
              <span>{size === option.value ? "✓" : ""}</span>{option.label}
            </button>
          ))}
          <div className="river-image-menu-separator" />
          <button type="button" role="menuitem" onClick={() => { openImage(); setMenuOpen(false); }}>打开</button>
          <div className="river-image-menu-separator" />
          <button type="button" role="menuitem" onClick={() => { void handleCopy(true); }}>剪切</button>
          <button type="button" role="menuitem" onClick={() => { void handleCopy(false); }}>拷贝</button>
          <button type="button" role="menuitem" onClick={() => { void pasteImage(); setMenuOpen(false); }}>粘贴</button>
          <div className="river-image-menu-separator" />
          <button type="button" role="menuitem" onClick={() => { saveImage(); setMenuOpen(false); }}>另存为...</button>
          <div className="river-image-menu-separator" />
          <button type="button" role="menuitem" onClick={() => { removeImage(); setMenuOpen(false); }}>删除</button>
        </div>
      )}
    </NodeViewWrapper>
  );
}

export const RiverImage = Node.create({
  name: "riverImage",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return {
      src: { default: "" },
      alt: { default: "River image" },
      size: { default: "medium" },
    };
  },
  parseHTML() {
    return [{ tag: "figure[data-river-image]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["figure", { "data-river-image": "true", ...HTMLAttributes }, ["img", { src: HTMLAttributes.src, alt: HTMLAttributes.alt }]];
  },
  addNodeView() {
    return ReactNodeViewRenderer(RiverImageView);
  },
});

export async function compressImageBlob(blob: Blob, maxDimension = 1600, quality = 0.82): Promise<string> {
  const source = await loadImageSource(blob);
  const delay = Number((globalThis as { __riverImageCompressionDelayMs?: number }).__riverImageCompressionDelayMs || 0);
  if (Number.isFinite(delay) && delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  const ratio = Math.min(1, maxDimension / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * ratio));
  const height = Math.max(1, Math.round(source.height * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法压缩图片。");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source.image, 0, 0, width, height);
  source.close();
  const webp = canvas.toDataURL("image/webp", quality);
  if (webp.startsWith("data:image/webp")) return webp;
  return canvas.toDataURL("image/jpeg", quality);
}

async function loadImageSource(blob: Blob): Promise<{ image: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    return { image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  }
  const url = URL.createObjectURL(blob);
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("图片读取失败。"));
    image.src = url;
  });
  return { image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) };
}

export interface InsertImageExecutionOptions {
  position?: number;
  isCurrent?: () => boolean;
}

export async function insertImageFile(editor: Editor, file: File, options: InsertImageExecutionOptions = {}): Promise<boolean> {
  if (!file.type.startsWith("image/")) throw new Error("请选择图片文件。");
  const src = await compressImageBlob(file);
  // The file picker and image compression are asynchronous. Re-check every
  // precondition after compression, immediately before mutating the document.
  if (editor.isDestroyed) throw new Error("编辑器已关闭，图片未插入。");
  if (options.isCurrent && !options.isCurrent()) throw new Error("当前笔记已切换，图片未插入。");
  const insertPosition = options.position ?? editor.state.selection.to;
  if (!Number.isInteger(insertPosition) || insertPosition < 0 || insertPosition > editor.state.doc.content.size) {
    throw new Error("原插入位置已失效，图片未插入。");
  }
  const inserted = editor.chain().focus().insertContentAt(insertPosition, {
    type: "riverImage",
    attrs: { src, alt: file.name, size: "medium" },
  }).run();
  if (!inserted) throw new Error("图片插入失败，请重试。");
  return true;
}

export interface InsertImageMenuOptions {
  position?: number;
  isCurrent?: () => boolean;
}

export function pickAndInsertImage(editor: Editor, onError: (message: string) => void, options: InsertImageMenuOptions = {}): boolean {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.style.display = "none";
  input.dataset.testid = "river-image-file-input";
  document.body.append(input);
  const cleanup = () => {
    if (input.isConnected) input.remove();
  };
  input.addEventListener("cancel", cleanup, { once: true });
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    cleanup();
    if (!file) return;
    void insertImageFile(editor, file, options).catch((error) => onError(error instanceof Error ? error.message : "插入图片失败。"));
  }, { once: true });
  input.click();
  return true;
}
