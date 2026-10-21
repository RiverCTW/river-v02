import type { SourceDocument } from "../types";
import { db } from "./database";

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(reader.error || new Error("附件读取失败。"));
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType || "application/octet-stream" });
}

export async function serializeSourcesForBackup(sources: SourceDocument[]): Promise<SourceDocument[]> {
  const result: SourceDocument[] = [];
  for (const source of sources) {
    const { originalBlob, ...rest } = source;
    if (originalBlob && originalBlob.size <= MAX_ATTACHMENT_BYTES) {
      result.push({
        ...rest,
        originalBase64: await blobToBase64(originalBlob),
        originalMimeType: source.originalMimeType || originalBlob.type || source.mimeType,
      });
    } else {
      result.push({ ...rest, attachmentOmitted: true });
    }
  }
  return result;
}

export function deserializeSourcesFromBackup(sources: SourceDocument[]): SourceDocument[] {
  return sources.map((source) => {
    if (!source.originalBase64) return source;
    const { originalBase64, ...rest } = source;
    return {
      ...rest,
      originalBlob: base64ToBlob(originalBase64, source.originalMimeType || source.mimeType),
    };
  });
}

export async function createBackupPayload() {
  return {
    format: "river-backup",
    version: 2,
    exportedAt: new Date().toISOString(),
    folders: await db.folders.toArray(),
    notes: await db.notes.toArray(),
    sources: await serializeSourcesForBackup(await db.sources.toArray()),
    profiles: await db.profiles.toArray(),
    introductions: await db.introductions.toArray(),
    nodes: await db.nodes.toArray(),
    blocks: await db.blocks.toArray(),
    settings: await db.settings.toArray(),
    learningMaps: await db.learningMaps.toArray(),
    chatMessages: await db.chatMessages.toArray(),
  };
}

export async function restoreBackupPayload(data: any): Promise<void> {
  if (data?.format !== "river-backup" || ![1, 2].includes(data?.version)) {
    throw new Error("备份文件格式无效或版本不兼容。");
  }
  await db.transaction("rw", [db.folders, db.notes, db.sources, db.profiles, db.introductions, db.nodes, db.blocks, db.settings, db.learningMaps, db.chatMessages], async () => {
    await Promise.all([
      db.folders.clear(), db.notes.clear(), db.sources.clear(), db.profiles.clear(), db.introductions.clear(), db.nodes.clear(), db.blocks.clear(), db.settings.clear(), db.learningMaps.clear(), db.chatMessages.clear(),
    ]);
    await db.folders.bulkAdd(data.folders || []);
    await db.notes.bulkAdd(data.notes || []);
    await db.sources.bulkAdd(deserializeSourcesFromBackup(data.sources || []));
    await db.profiles.bulkAdd(data.profiles || []);
    await db.introductions.bulkAdd(data.introductions || []);
    await db.nodes.bulkAdd(data.nodes || []);
    await db.blocks.bulkAdd(data.blocks || []);
    await db.settings.bulkAdd(data.settings || []);
    await db.learningMaps.bulkAdd(data.learningMaps || []);
    await db.chatMessages.bulkAdd(data.chatMessages || []);
  });
}
