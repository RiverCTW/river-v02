import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { applyDeletedNoteTombstones } from "./tombstones";

export type UserRole = "admin" | "user";

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
  createdAt: string;
}

export type GenerationJobStatus =
  | "QUEUED"
  | "PARSING"
  | "PLANNING"
  | "GENERATING"
  | "MERGING"
  | "VALIDATING"
  | "SAVING"
  | "COMPLETED"
  | "FAILED"
  | "RETRY_PENDING"
  | "NEEDS_INPUT";

export interface GenerationJobRecord {
  id: string;
  userId: string;
  noteId: string;
  status: GenerationJobStatus;
  stage: string;
  progress: number;
  message: string;
  currentFile: string | null;
  pageRange: string | null;
  sectionTitle: string | null;
  completedSections: number;
  totalSections: number;
  totalPages: number;
  provider: string;
  model: string;
  payloadJson: unknown;
  credentialCipher: string | null;
  credentialIv: string | null;
  credentialTag: string | null;
  resultJson: unknown | null;
  errorCode: string | null;
  errorMessage: string | null;
  retryCount: number;
  leaseUntil: string | null;
  heartbeatAt: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export interface GenerationJobInput {
  id: string;
  userId: string;
  noteId: string;
  provider: string;
  model: string;
  payloadJson: unknown;
  credentialCipher: string;
  credentialIv: string;
  credentialTag: string;
}

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  role: UserRole;
  created_at: string;
}

interface SessionRow {
  user_id: string;
}

const SESSION_DAYS = 30;
const sessionMaxAgeSeconds = SESSION_DAYS * 24 * 60 * 60;

function nowIso() {
  return new Date().toISOString();
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${digest}`;
}

function passwordMatches(password: string, stored: string) {
  const [salt, digest] = stored.split(":");
  if (!salt || !digest) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(digest, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function publicUser(row: UserRow): AuthUser {
  return { id: row.id, username: row.username, role: row.role, createdAt: row.created_at };
}

export class RiverPersistence {
  readonly db: DatabaseSync;

  constructor(databasePath = process.env.RIVER_DB_PATH || path.resolve(process.cwd(), ".data/river-v0.2.sqlite")) {
    mkdirSync(path.dirname(databasePath), { recursive: true });
    this.db = new DatabaseSync(databasePath);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    this.db.exec(`
      create table if not exists users (
        id text primary key,
        username text not null unique collate nocase,
        password_hash text not null,
        role text not null check(role in ('admin','user')),
        created_at text not null
      );
      create table if not exists sessions (
        token_hash text primary key,
        user_id text not null references users(id) on delete cascade,
        expires_at text not null,
        created_at text not null
      );
      create table if not exists workspaces (
        user_id text primary key references users(id) on delete cascade,
        revision integer not null default 0,
        payload text,
        updated_at text not null
      );
      create index if not exists sessions_user_idx on sessions(user_id);
      create index if not exists sessions_expiry_idx on sessions(expires_at);
      create table if not exists generation_jobs (
        id text primary key,
        user_id text not null,
        note_id text not null,
        status text not null,
        stage text not null,
        progress integer not null default 0,
        message text not null default '',
        current_file text,
        page_range text,
        section_title text,
        completed_sections integer not null default 0,
        total_sections integer not null default 0,
        provider text not null,
        model text not null,
        payload_json text not null,
        credential_cipher text,
        credential_iv text,
        credential_tag text,
        result_json text,
        error_code text,
        error_message text,
        retry_count integer not null default 0,
        lease_until text,
        heartbeat_at text,
        created_at text not null,
        updated_at text not null,
        finished_at text
      );
      create index if not exists generation_jobs_note_idx on generation_jobs(user_id, note_id, status);
      create index if not exists generation_jobs_status_idx on generation_jobs(status, updated_at);
      create unique index if not exists generation_jobs_one_active_note_idx
        on generation_jobs(user_id, note_id)
        where status in ('QUEUED','PARSING','PLANNING','GENERATING','MERGING','VALIDATING','SAVING','RETRY_PENDING');
    `);
    const generationColumns = this.db.prepare("pragma table_info(generation_jobs)").all() as Array<{ name: string }>;
    if (!generationColumns.some((column) => column.name === "total_pages")) {
      this.db.exec("alter table generation_jobs add column total_pages integer not null default 0");
    }
    this.ensureBootstrapAdmin();
  }

  private ensureBootstrapAdmin() {
    const count = Number((this.db.prepare("select count(*) as count from users").get() as { count: number }).count);
    if (count > 0) return;
    const username = process.env.RIVER_ADMIN_USERNAME || "admin";
    const password = process.env.RIVER_ADMIN_PASSWORD || "river-admin";
    this.createUser(username, password, "admin");
  }

  createUser(username: string, password: string, role: UserRole = "user"): AuthUser {
    const normalized = username.trim();
    if (!/^[\p{L}\p{N}_.-]{2,40}$/u.test(normalized)) throw new Error("用户名需为 2-40 个字母、数字、汉字、点、横线或下划线。");
    if (password.length < 6) throw new Error("密码至少需要 6 个字符。");
    const row: UserRow = {
      id: crypto.randomUUID(),
      username: normalized,
      password_hash: passwordHash(password),
      role,
      created_at: nowIso(),
    };
    try {
      this.db.prepare("insert into users(id, username, password_hash, role, created_at) values(?,?,?,?,?)")
        .run(row.id, row.username, row.password_hash, row.role, row.created_at);
      this.db.prepare("insert or ignore into workspaces(user_id, revision, payload, updated_at) values(?,0,null,?)")
        .run(row.id, row.created_at);
    } catch (error) {
      if (String(error).includes("UNIQUE")) throw new Error("用户名已经存在。");
      throw error;
    }
    return publicUser(row);
  }

  authenticate(username: string, password: string): AuthUser | null {
    const row = this.db.prepare("select * from users where username = ? collate nocase").get(username.trim()) as UserRow | undefined;
    if (!row || !passwordMatches(password, row.password_hash)) return null;
    return publicUser(row);
  }

  createSession(userId: string): string {
    const token = randomBytes(32).toString("base64url");
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + sessionMaxAgeSeconds * 1000).toISOString();
    this.db.prepare("insert into sessions(token_hash, user_id, expires_at, created_at) values(?,?,?,?)")
      .run(hashToken(token), userId, expiresAt, createdAt);
    this.db.prepare("delete from sessions where expires_at <= ?").run(createdAt);
    return token;
  }

  userForSession(token: string | null): AuthUser | null {
    if (!token) return null;
    const row = this.db.prepare(`
      select users.* from sessions join users on users.id = sessions.user_id
      where sessions.token_hash = ? and sessions.expires_at > ?
    `).get(hashToken(token), nowIso()) as UserRow | undefined;
    return row ? publicUser(row) : null;
  }

  deleteSession(token: string | null) {
    if (token) this.db.prepare("delete from sessions where token_hash = ?").run(hashToken(token));
  }

  listUsers(): AuthUser[] {
    return (this.db.prepare("select * from users order by created_at asc").all() as unknown as UserRow[]).map(publicUser);
  }

  private generationJobFromRow(row: any): GenerationJobRecord {
    return {
      id: row.id, userId: row.user_id, noteId: row.note_id, status: row.status,
      stage: row.stage, progress: Number(row.progress), message: row.message,
      currentFile: row.current_file, pageRange: row.page_range, sectionTitle: row.section_title,
      completedSections: Number(row.completed_sections), totalSections: Number(row.total_sections),
      totalPages: Number(row.total_pages || 0),
      provider: row.provider, model: row.model,
      payloadJson: row.payload_json ? JSON.parse(row.payload_json) : null,
      credentialCipher: row.credential_cipher, credentialIv: row.credential_iv, credentialTag: row.credential_tag,
      resultJson: row.result_json ? JSON.parse(row.result_json) : null,
      errorCode: row.error_code, errorMessage: row.error_message, retryCount: Number(row.retry_count),
      leaseUntil: row.lease_until, heartbeatAt: row.heartbeat_at,
      createdAt: row.created_at, updatedAt: row.updated_at, finishedAt: row.finished_at,
    };
  }

  getGenerationJob(jobId: string, userId?: string): GenerationJobRecord | null {
    const row = userId
      ? this.db.prepare("select * from generation_jobs where id=? and user_id=?").get(jobId, userId)
      : this.db.prepare("select * from generation_jobs where id=?").get(jobId);
    return row ? this.generationJobFromRow(row) : null;
  }

  getActiveGenerationJob(userId: string, noteId: string): GenerationJobRecord | null {
    const row = this.db.prepare(`
      select * from generation_jobs where user_id=? and note_id=? and status in
      ('QUEUED','PARSING','PLANNING','GENERATING','MERGING','VALIDATING','SAVING','RETRY_PENDING')
      order by created_at desc limit 1
    `).get(userId, noteId);
    return row ? this.generationJobFromRow(row) : null;
  }

  createGenerationJob(input: GenerationJobInput): GenerationJobRecord {
    const existing = this.getActiveGenerationJob(input.userId, input.noteId);
    if (existing) return existing;
    const now = nowIso();
    this.db.prepare(`
      insert into generation_jobs(id,user_id,note_id,status,stage,progress,message,completed_sections,total_sections,provider,model,payload_json,credential_cipher,credential_iv,credential_tag,retry_count,created_at,updated_at)
      values(?,?,?,'QUEUED','queued',1,'等待后台任务开始',0,0,?,?,?,?,?,?,0,?,?)
    `).run(input.id,input.userId,input.noteId,input.provider,input.model,JSON.stringify(input.payloadJson),input.credentialCipher,input.credentialIv,input.credentialTag,now,now);
    return this.getGenerationJob(input.id, input.userId)!;
  }

  updateGenerationJob(id: string, changes: Partial<Omit<GenerationJobRecord, "id" | "userId" | "noteId" | "createdAt">>): GenerationJobRecord | null {
    const existing = this.getGenerationJob(id);
    if (!existing) return null;
    const next: GenerationJobRecord = { ...existing, ...changes, updatedAt: nowIso() };
    this.db.prepare(`
      update generation_jobs set status=?,stage=?,progress=?,message=?,current_file=?,page_range=?,section_title=?,
        completed_sections=?,total_sections=?,total_pages=?,credential_cipher=?,credential_iv=?,credential_tag=?,result_json=?,
        error_code=?,error_message=?,retry_count=?,lease_until=?,heartbeat_at=?,updated_at=?,finished_at=? where id=?
    `).run(next.status,next.stage,next.progress,next.message,next.currentFile,next.pageRange,next.sectionTitle,
      next.completedSections,next.totalSections,next.totalPages,next.credentialCipher,next.credentialIv,next.credentialTag,
      next.resultJson == null ? null : JSON.stringify(next.resultJson),next.errorCode,next.errorMessage,next.retryCount,
      next.leaseUntil,next.heartbeatAt,next.updatedAt,next.finishedAt,id);
    return this.getGenerationJob(id);
  }

  listRecoverableGenerationJobs(): GenerationJobRecord[] {
    const rows = this.db.prepare(`
      select * from generation_jobs where status in
      ('QUEUED','PARSING','PLANNING','GENERATING','MERGING','VALIDATING','SAVING','RETRY_PENDING')
      order by created_at asc
    `).all() as any[];
    return rows.map((row) => this.generationJobFromRow(row));
  }

  firstAdmin(): AuthUser | null {
    const row = this.db.prepare("select * from users where role = 'admin' order by created_at asc limit 1").get() as UserRow | undefined;
    return row ? publicUser(row) : null;
  }

  getWorkspace(userId: string): { revision: number; payload: unknown | null; updatedAt: string | null } {
    const row = this.db.prepare("select revision, payload, updated_at from workspaces where user_id = ?").get(userId) as
      | { revision: number; payload: string | null; updated_at: string }
      | undefined;
    if (!row) return { revision: 0, payload: null, updatedAt: null };
    return {
      revision: Number(row.revision),
      payload: row.payload ? JSON.parse(row.payload) : null,
      updatedAt: row.updated_at,
    };
  }

  putWorkspace(userId: string, expectedRevision: number, payload: unknown): { revision: number; updatedAt: string } {
    const current = this.getWorkspace(userId);
    if (current.revision !== expectedRevision) {
      const error = new Error("云端工作区已被其他设备更新。本地修改未覆盖云端，请重新载入后再处理。") as Error & { status?: number; code?: string };
      error.status = 409;
      error.code = "workspace_revision_conflict";
      throw error;
    }
    payload = applyDeletedNoteTombstones(current.payload as any, payload as any);
    this.assertLockedRules(current.payload as any, payload as any);
    const revision = current.revision + 1;
    const updatedAt = nowIso();
    this.db.prepare(`
      insert into workspaces(user_id, revision, payload, updated_at) values(?,?,?,?)
      on conflict(user_id) do update set revision=excluded.revision, payload=excluded.payload, updated_at=excluded.updated_at
    `).run(userId, revision, JSON.stringify(payload), updatedAt);
    return { revision, updatedAt };
  }

  private assertLockedRules(previous: any, next: any) {
    if (!previous || !next) return;
    const lockedNotes = new Set<string>((previous.notes || [])
      .filter((note: any) => note.generationState === "completed" || note.sourcesLockedAt)
      .map((note: any) => note.id));
    for (const noteId of lockedNotes) {
      // Deleting a note entirely is allowed; only edits to a note that still
      // exists must keep its locked sources/profile immutable.
      if (!(next.notes || []).some((note: any) => note.id === noteId)) continue;
      const sourceSignature = (payload: any) => JSON.stringify((payload.sources || [])
        .filter((source: any) => source.noteId === noteId)
        .sort((a: any, b: any) => Number(a.order || 0) - Number(b.order || 0))
        .map((source: any) => ({ id: source.id, fileName: source.fileName, order: source.order, parseStatus: source.parseStatus, textCharCount: source.textCharCount })));
      const profileSignature = (payload: any) => {
        const profile = (payload.profiles || []).find((item: any) => item.noteId === noteId);
        if (!profile) return "null";
        const { lockedAt: _lockedAt, createdAt: _createdAt, updatedAt: _updatedAt, ...inputs } = profile;
        return JSON.stringify(inputs);
      };
      if (sourceSignature(previous) !== sourceSignature(next) || profileSignature(previous) !== profileSignature(next)) {
        const error = new Error("这份笔记的资料或学习偏好已经锁定，服务端拒绝修改。") as Error & { status?: number; code?: string };
        error.status = 423;
        error.code = "learning_inputs_locked";
        throw error;
      }
    }
  }

  close() {
    this.db.close();
  }
}

export interface PersistenceAdapter {
  createUser(username: string, password: string, role?: UserRole): Promise<AuthUser>;
  authenticate(username: string, password: string): Promise<AuthUser | null>;
  createSession(userId: string): Promise<string>;
  userForSession(token: string | null): Promise<AuthUser | null>;
  deleteSession(token: string | null): Promise<void>;
  listUsers(): Promise<AuthUser[]>;
  firstAdmin(): Promise<AuthUser | null>;
  getWorkspace(userId: string): Promise<{ revision: number; payload: unknown | null; updatedAt: string | null }>;
  putWorkspace(userId: string, expectedRevision: number, payload: unknown): Promise<{ revision: number; updatedAt: string }>;
  getGenerationJob(jobId: string, userId?: string): Promise<GenerationJobRecord | null>;
  getActiveGenerationJob(userId: string, noteId: string): Promise<GenerationJobRecord | null>;
  createGenerationJob(input: GenerationJobInput): Promise<GenerationJobRecord>;
  updateGenerationJob(id: string, changes: Partial<Omit<GenerationJobRecord, "id" | "userId" | "noteId" | "createdAt">>): Promise<GenerationJobRecord | null>;
  listRecoverableGenerationJobs(): Promise<GenerationJobRecord[]>;
}

export async function createPersistence(): Promise<PersistenceAdapter> {
  if (process.env.DATABASE_URL) {
    const { PostgresPersistence } = await import("./persistence-postgres");
    return PostgresPersistence.create();
  }
  const sqlite = new RiverPersistence();
  return {
    createUser: async (...args) => sqlite.createUser(...args),
    authenticate: async (...args) => sqlite.authenticate(...args),
    createSession: async (...args) => sqlite.createSession(...args),
    userForSession: async (...args) => sqlite.userForSession(...args),
    deleteSession: async (token) => sqlite.deleteSession(token),
    listUsers: async () => sqlite.listUsers(),
    firstAdmin: async () => sqlite.firstAdmin(),
    getWorkspace: async (userId) => sqlite.getWorkspace(userId),
    putWorkspace: async (userId, expectedRevision, payload) => sqlite.putWorkspace(userId, expectedRevision, payload),
    getGenerationJob: async (jobId, userId) => sqlite.getGenerationJob(jobId, userId),
    getActiveGenerationJob: async (userId, noteId) => sqlite.getActiveGenerationJob(userId, noteId),
    createGenerationJob: async (input) => sqlite.createGenerationJob(input),
    updateGenerationJob: async (id, changes) => sqlite.updateGenerationJob(id, changes),
    listRecoverableGenerationJobs: async () => sqlite.listRecoverableGenerationJobs(),
  };
}

export function sessionCookie(token: string) {
  const secure = process.env.NODE_ENV === "production" && process.env.RIVER_INSECURE_COOKIE !== "1" ? "; Secure" : "";
  return `river_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${sessionMaxAgeSeconds}${secure}`;
}

export const clearedSessionCookie = "river_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0";
