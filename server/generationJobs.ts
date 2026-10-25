import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { nanoid } from "nanoid";
import { generateCompleteLearningPackage } from "./ai";
import type { GenerationJobRecord, PersistenceAdapter } from "./persistence";
import { nodesToTiptap } from "../src/editor/convert";
import { composeLearningOpeningOutline } from "../src/services/learningOpeningOutline";
import { buildCompanionMaps } from "../src/services/companionCopy";

const credentialKey = createHash("sha256")
  .update(process.env.RIVER_GENERATION_SECRET || process.env.RIVER_ADMIN_PASSWORD || "river-v021-local-development-secret")
  .digest();

export function encryptGenerationCredential(plaintext: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", credentialKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    cipher: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

function decryptGenerationCredential(job: GenerationJobRecord): string {
  if (!job.credentialCipher || !job.credentialIv || !job.credentialTag) throw new Error("后台任务缺少模型凭据。");
  const decipher = createDecipheriv("aes-256-gcm", credentialKey, Buffer.from(job.credentialIv, "base64"));
  decipher.setAuthTag(Buffer.from(job.credentialTag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(job.credentialCipher, "base64")), decipher.final()]).toString("utf8");
}

export function publicGenerationJob(job: GenerationJobRecord) {
  return {
    jobId: job.id,
    noteId: job.noteId,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    message: job.message,
    currentFile: job.currentFile,
    pageRange: job.pageRange,
    sectionTitle: job.sectionTitle,
    completedSections: job.completedSections,
    totalSections: job.totalSections,
    totalPages: job.totalPages,
    provider: job.provider,
    model: job.model,
    errorCode: job.errorCode,
    errorMessage: job.errorMessage,
    retryCount: job.retryCount,
    result: job.status === "COMPLETED" ? job.resultJson : undefined,
    requestedAt: job.createdAt,
    updatedAt: job.updatedAt,
    finishedAt: job.finishedAt,
  };
}

const runningJobs = new Map<string, Promise<void>>();

function classifyGenerationError(message: string) {
  if (/api.?key|unauthorized|401|认证|密钥/i.test(message)) return "invalid_api_key";
  if (/quota|insufficient|余额|额度|429/i.test(message)) return "model_quota_exhausted";
  if (/json|schema|parse|格式|校验/i.test(message)) return "generation_result_invalid";
  if (/database|workspace|数据库|工作区|保存/i.test(message)) return "generation_commit_failed";
  return "generation_failed";
}

function mapGeneratedTree(noteId: string, tree: any, createdAt: string) {
  const nodes: any[] = [];
  const blocks: any[] = [];
  const walk = (items: any[], parentId: string | null) => (items || []).forEach((item, index) => {
    const nodeId = nanoid();
    nodes.push({
      id: nodeId, noteId, parentId, order: index, title: item.title,
      nodeType: item.nodeType || "knowledge", headingLevel: item.headingLevel,
      collapsed: false, sourceRefs: item.sourceRefs || [], userModified: false,
      createdAt, updatedAt: createdAt,
    });
    (item.blocks || []).forEach((block: any, blockIndex: number) => blocks.push({
      id: nanoid(), nodeId, noteId, order: blockIndex, type: block.type || "explanation",
      text: String(block.text || ""), sourceRefs: block.sourceRefs || [],
      userModified: false, createdAt, updatedAt: createdAt,
    }));
    if (item.children?.length) walk(item.children, nodeId);
  });
  walk(tree?.nodes || [], null);
  return { nodes, blocks };
}

function buildLearningMap(noteId: string, kind: "requirements" | "questions", value: any, createdAt: string) {
  const { nodes, blocks } = mapGeneratedTree(noteId, value, createdAt);
  return {
    noteId, kind, editorDoc: nodesToTiptap(nodes as any, blocks as any),
    nodes, blocks, syncEnabled: false, revision: 1, createdAt, updatedAt: createdAt,
  };
}

async function commitGenerationWorkspace(persistence: PersistenceAdapter, job: GenerationJobRecord, result: any) {
  const payload = job.payloadJson as any;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const workspace = await persistence.getWorkspace(job.userId);
    const current = workspace.payload as any;
    if (!current) throw new Error("无法保存生成结果：账号工作区不存在。");
    const existingNote = (current.notes || []).find((note: any) => note.id === job.noteId);
    if (!existingNote) throw new Error("无法保存生成结果：目标笔记已被删除。");
    const createdAt = new Date().toISOString();
    const profile = payload.profile;
    const lockedProfile = { ...profile, lockedAt: createdAt, updatedAt: createdAt };
    const mappedTree = mapGeneratedTree(job.noteId, result?.data?.tree, createdAt);
    const introduction = {
      ...(result?.data?.introduction || {}), noteId: job.noteId,
      generatedAt: createdAt, userModified: false,
    };
    const existingNodes = (current.nodes || []).filter((node: any) => node.noteId === job.noteId);
    const existingBlocks = (current.blocks || []).filter((block: any) => block.noteId === job.noteId);
    const existingIntroduction = (current.introductions || []).find((item: any) => item.noteId === job.noteId);
    const composed = composeLearningOpeningOutline(
      { note: existingNote, profile: lockedProfile, introduction: existingIntroduction, nodes: existingNodes, blocks: existingBlocks } as any,
      introduction as any,
      createdAt,
      mappedTree as any,
    );
    const editorDoc = nodesToTiptap(composed.nodes, composed.blocks);
    const nextTitle = result?.data?.tree?.title || existingNote.title;
    // v0.22 companion documents are a one-time copy of the main tree; no
    // second AI call and no reference answers.
    const companion = buildCompanionMaps(composed.nodes as any, composed.blocks as any, job.noteId, createdAt);
    const requirementMap = companion.requirements;
    const questionMap = companion.questions;
    const notePatch = {
      title: nextTitle, editorDoc, revision: Number(existingNote.revision || 0) + 1,
      updatedAt: createdAt, generationState: "completed",
      sourcesLockedAt: existingNote.sourcesLockedAt || createdAt,
      profileLockedAt: existingNote.profileLockedAt || createdAt,
      generatedAt: createdAt, generationError: null,
    };
    const commit = {
      note: { ...existingNote, ...notePatch }, profile: lockedProfile, introduction,
      nodes: composed.nodes, blocks: composed.blocks,
      learningMaps: [requirementMap, questionMap].filter(Boolean), revisionSource: workspace.revision,
    };
    const nextPayload = {
      ...current,
      notes: (current.notes || []).map((note: any) => note.id === job.noteId ? commit.note : note),
      profiles: [...(current.profiles || []).filter((item: any) => item.noteId !== job.noteId), lockedProfile],
      introductions: [...(current.introductions || []).filter((item: any) => item.noteId !== job.noteId), introduction],
      nodes: [...(current.nodes || []).filter((node: any) => node.noteId !== job.noteId), ...composed.nodes],
      blocks: [...(current.blocks || []).filter((block: any) => block.noteId !== job.noteId), ...composed.blocks],
      learningMaps: [...(current.learningMaps || []).filter((map: any) => map.noteId !== job.noteId), ...[requirementMap, questionMap].filter(Boolean)],
    };
    try {
      const saved = await persistence.putWorkspace(job.userId, workspace.revision, nextPayload);
      return { ...result, data: { ...result.data, commit: { ...commit, workspaceRevision: saved.revision } } };
    } catch (error) {
      lastError = error;
      const typed = error as { status?: number; code?: string };
      if (typed.status !== 409 && typed.code !== "workspace_revision_conflict") throw error;
    }
  }
  throw lastError || new Error("生成结果保存时持续发生工作区版本冲突。");
}

async function markGenerationFailure(persistence: PersistenceAdapter, job: GenerationJobRecord, message: string) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const workspace = await persistence.getWorkspace(job.userId);
    const current = workspace.payload as any;
    if (!current?.notes) return;
    const nextPayload = {
      ...current,
      notes: current.notes.map((note: any) => note.id === job.noteId ? {
        ...note, generationState: "failed", generationError: message, sourcesLockedAt: null, profileLockedAt: null, updatedAt: new Date().toISOString(),
      } : note),
    };
    try {
      await persistence.putWorkspace(job.userId, workspace.revision, nextPayload);
      return;
    } catch (error) {
      const typed = error as { status?: number; code?: string };
      if (typed.status !== 409 && typed.code !== "workspace_revision_conflict") throw error;
    }
  }
}

export function launchGenerationJob(persistence: PersistenceAdapter, jobId: string) {
  if (runningJobs.has(jobId)) return runningJobs.get(jobId)!;
  const task = processGenerationJob(persistence, jobId).finally(() => runningJobs.delete(jobId));
  runningJobs.set(jobId, task);
  return task;
}

async function processGenerationJob(persistence: PersistenceAdapter, jobId: string) {
  const job = await persistence.getGenerationJob(jobId);
  if (!job || job.status === "COMPLETED" || job.status === "FAILED") return;
  try {
    const apiKey = decryptGenerationCredential(job);
    const payload = job.payloadJson as any;
    await persistence.updateGenerationJob(jobId, {
      status: "PARSING", stage: "PARSING", progress: 3, message: "后台任务已启动",
      totalPages: Math.max(0, Number(payload.totalPages || 0)),
      leaseUntil: new Date(Date.now() + 15 * 60 * 1000).toISOString(), heartbeatAt: new Date().toISOString(),
    });
    const generated = await generateCompleteLearningPackage({
      provider: job.provider as any,
      apiKey,
      model: job.model,
      sessionId: typeof payload.sessionId === "string" ? payload.sessionId : undefined,
      sourceText: String(payload.sourceText || ""),
      profile: payload.profile,
      customization: typeof payload.customization === "string" ? payload.customization : "",
      introduction: payload.introduction,
      onProgress: async (progress, message, meta) => {
        await persistence.updateGenerationJob(jobId, {
          status: (meta?.stage || "GENERATING") as any,
          stage: meta?.stage || "GENERATING",
          progress,
          message,
          currentFile: meta?.currentFile || null,
          pageRange: meta?.pageRange || null,
          sectionTitle: meta?.sectionTitle || null,
          completedSections: meta?.completedSections ?? job.completedSections,
          totalSections: meta?.totalSections ?? job.totalSections,
          heartbeatAt: new Date().toISOString(),
          leaseUntil: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        });
      },
    });
    await persistence.updateGenerationJob(jobId, {
      status: "SAVING", stage: "SAVING", progress: 98, message: "正在保存到目标笔记",
      heartbeatAt: new Date().toISOString(), leaseUntil: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });
    const result = await commitGenerationWorkspace(persistence, job, generated);
    await persistence.updateGenerationJob(jobId, {
      status: "COMPLETED", stage: "COMPLETED", progress: 100, message: "知识树与学习地图已保存",
      resultJson: result, credentialCipher: null, credentialIv: null, credentialTag: null,
      leaseUntil: null, heartbeatAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markGenerationFailure(persistence, job, message).catch((markError) => {
      console.error("River generation failure state could not be saved", markError);
    });
    await persistence.updateGenerationJob(jobId, {
      status: "FAILED", stage: "FAILED", message: "生成失败", errorCode: classifyGenerationError(message), errorMessage: message,
      credentialCipher: null, credentialIv: null, credentialTag: null,
      leaseUntil: null, heartbeatAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
    });
  }
}

export async function resumeGenerationJobs(persistence: PersistenceAdapter) {
  const jobs = await persistence.listRecoverableGenerationJobs();
  jobs.forEach((job) => launchGenerationJob(persistence, job.id));
}

export function newGenerationJobId() {
  return randomUUID();
}
