import { nanoid } from "nanoid";
import type { SourceDocument } from "../types";

function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof FileReader === "undefined") return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error("读取课件文件失败。"));
    };
    reader.onerror = () => reject(reader.error || new Error("读取课件文件失败。"));
    reader.onabort = () => reject(new Error("课件文件读取已取消。"));
    reader.readAsArrayBuffer(blob);
  });
}

export async function parseCourseware(file: File, noteId: string): Promise<SourceDocument> {
  const lower = file.name.toLowerCase();
  const kind = lower.endsWith(".pdf") ? "pdf" : lower.endsWith(".pptx") ? "pptx" : null;
  if (!kind) {
    throw new Error("目前只支持 PDF 和 PPTX 文件。");
  }
  const id = nanoid();
  const createdAt = new Date().toISOString();
  try {
    const buffer = await readBlobAsArrayBuffer(file);
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    const sha256 = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const copiedBlob = new Blob([buffer], { type: file.type || "application/octet-stream" });
    if (kind === "pdf") {
      const { parsePdf } = await import("./pdfParser");
      const pages = await parsePdf(buffer);
      const textCharCount = pages.reduce((sum, page) => sum + page.charCount, 0);
      const parseStatus = textCharCount < 200 ? "partial" : "parsed";
      return {
        id,
        noteId,
        fileName: file.name,
        mimeType: file.type || "application/pdf",
        fileSize: file.size,
        kind,
        pages,
        slides: [],
        parseStatus,
        parseError: parseStatus === "partial" ? "提取到的文字过少，可能是扫描版或图片型 PDF；v0.1 暂未完整支持视觉解析。" : undefined,
        textCharCount,
        createdAt,
        sha256,
        originalBlob: copiedBlob,
        originalMimeType: file.type,
      };
    }
    const { parsePptx } = await import("./pptxParser");
    const slides = await parsePptx(buffer);
    const textCharCount = slides.reduce((sum, slide) => sum + slide.charCount, 0);
    const parseStatus = textCharCount < 80 ? "partial" : "parsed";
    return {
      id,
      noteId,
      fileName: file.name,
      mimeType: file.type || "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      fileSize: file.size,
      kind,
      pages: [],
      slides,
      parseStatus,
      parseError: parseStatus === "partial" ? "提取到的文字过少，可能是图片型幻灯片；v0.1 暂未完整支持视觉解析。" : undefined,
      textCharCount,
      createdAt,
      sha256,
      originalBlob: copiedBlob,
      originalMimeType: file.type,
    };
  } catch (error) {
    return {
      id,
      noteId,
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      kind,
      pages: [],
      slides: [],
      parseStatus: "failed",
      parseError: error instanceof Error ? error.message : "课件解析失败。",
      textCharCount: 0,
      createdAt,
    };
  }
}

export function sourceToText(source?: SourceDocument): string {
  if (!source) return "";
  if (source.pages.length) {
    return source.pages.map((page) => `[第 ${page.pageNumber} 页]\n${page.text}`).join("\n\n");
  }
  return source.slides.map((slide) => `[第 ${slide.slideNumber} 张幻灯片]\n${slide.text}`).join("\n\n");
}
