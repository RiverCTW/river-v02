import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import pg from "pg";
import type { AuthUser, UserRole } from "./persistence";

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  role: UserRole;
  created_at: Date | string;
}

const SESSION_DAYS = 30;

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
  return { id: row.id, username: row.username, role: row.role, createdAt: new Date(row.created_at).toISOString() };
}

export class PostgresPersistence {
  private constructor(private readonly pool: pg.Pool) {}

  static async create(): Promise<PostgresPersistence> {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is missing.");
    const ssl = process.env.DATABASE_SSL === "disable" ? false : { rejectUnauthorized: false };
    const persistence = new PostgresPersistence(new pg.Pool({ connectionString, ssl, max: 5 }));
    await persistence.initialize();
    return persistence;
  }

  private async initialize() {
    await this.pool.query(`
      create table if not exists users (
        id text primary key,
        username text not null,
        password_hash text not null,
        role text not null check(role in ('admin','user')),
        created_at timestamptz not null
      );
      create unique index if not exists users_username_lower_idx on users(lower(username));
      create table if not exists sessions (
        token_hash text primary key,
        user_id text not null references users(id) on delete cascade,
        expires_at timestamptz not null,
        created_at timestamptz not null
      );
      create index if not exists sessions_user_idx on sessions(user_id);
      create index if not exists sessions_expiry_idx on sessions(expires_at);
      create table if not exists workspaces (
        user_id text primary key references users(id) on delete cascade,
        revision integer not null default 0,
        payload jsonb,
        updated_at timestamptz not null
      );
    `);
    const result = await this.pool.query<{ count: string }>("select count(*)::text as count from users");
    if (Number(result.rows[0]?.count || 0) === 0) {
      await this.createUser(process.env.RIVER_ADMIN_USERNAME || "admin", process.env.RIVER_ADMIN_PASSWORD || "river-admin", "admin");
    }
  }

  async createUser(username: string, password: string, role: UserRole = "user"): Promise<AuthUser> {
    const normalized = username.trim();
    if (!/^[\p{L}\p{N}_.-]{2,40}$/u.test(normalized)) throw new Error("用户名需为 2-40 个字母、数字、汉字、点、横线或下划线。");
    if (password.length < 6) throw new Error("密码至少需要 6 个字符。");
    const row: UserRow = {
      id: randomUUID(),
      username: normalized,
      password_hash: passwordHash(password),
      role,
      created_at: new Date().toISOString(),
    };
    try {
      await this.pool.query(
        "insert into users(id, username, password_hash, role, created_at) values($1,$2,$3,$4,$5)",
        [row.id, row.username, row.password_hash, row.role, row.created_at],
      );
      await this.pool.query(
        "insert into workspaces(user_id, revision, payload, updated_at) values($1,0,null,now()) on conflict(user_id) do nothing",
        [row.id],
      );
    } catch (error) {
      if ((error as { code?: string }).code === "23505") throw new Error("用户名已经存在。");
      throw error;
    }
    return publicUser(row);
  }

  async authenticate(username: string, password: string): Promise<AuthUser | null> {
    const result = await this.pool.query<UserRow>("select * from users where lower(username)=lower($1) limit 1", [username.trim()]);
    const row = result.rows[0];
    if (!row || !passwordMatches(password, row.password_hash)) return null;
    return publicUser(row);
  }

  async createSession(userId: string): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await this.pool.query("insert into sessions(token_hash,user_id,expires_at,created_at) values($1,$2,$3,now())", [hashToken(token), userId, expiresAt]);
    await this.pool.query("delete from sessions where expires_at <= now()");
    return token;
  }

  async userForSession(token: string | null): Promise<AuthUser | null> {
    if (!token) return null;
    const result = await this.pool.query<UserRow>(`
      select users.* from sessions join users on users.id=sessions.user_id
      where sessions.token_hash=$1 and sessions.expires_at>now() limit 1
    `, [hashToken(token)]);
    return result.rows[0] ? publicUser(result.rows[0]) : null;
  }

  async deleteSession(token: string | null) {
    if (token) await this.pool.query("delete from sessions where token_hash=$1", [hashToken(token)]);
  }

  async listUsers(): Promise<AuthUser[]> {
    const result = await this.pool.query<UserRow>("select * from users order by created_at asc");
    return result.rows.map(publicUser);
  }

  async firstAdmin(): Promise<AuthUser | null> {
    const result = await this.pool.query<UserRow>("select * from users where role='admin' order by created_at asc limit 1");
    return result.rows[0] ? publicUser(result.rows[0]) : null;
  }

  async getWorkspace(userId: string): Promise<{ revision: number; payload: unknown | null; updatedAt: string | null }> {
    const result = await this.pool.query<{ revision: number; payload: unknown | null; updated_at: Date | string }>(
      "select revision,payload,updated_at from workspaces where user_id=$1", [userId],
    );
    const row = result.rows[0];
    if (!row) return { revision: 0, payload: null, updatedAt: null };
    return { revision: Number(row.revision), payload: row.payload, updatedAt: new Date(row.updated_at).toISOString() };
  }

  async putWorkspace(userId: string, expectedRevision: number, payload: unknown): Promise<{ revision: number; updatedAt: string }> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const current = await client.query<{ revision: number; payload: unknown | null }>(
        "select revision,payload from workspaces where user_id=$1 for update", [userId],
      );
      const revision = Number(current.rows[0]?.revision || 0);
      if (revision !== expectedRevision) {
        const error = new Error("云端工作区已被其他设备更新。本地修改未覆盖云端，请重新载入后再处理。") as Error & { status?: number; code?: string };
        error.status = 409;
        error.code = "workspace_revision_conflict";
        throw error;
      }
      this.assertLockedRules(current.rows[0]?.payload as any, payload as any);
      const nextRevision = revision + 1;
      const result = await client.query<{ updated_at: Date | string }>(`
        insert into workspaces(user_id,revision,payload,updated_at) values($1,$2,$3::jsonb,now())
        on conflict(user_id) do update set revision=excluded.revision,payload=excluded.payload,updated_at=excluded.updated_at
        returning updated_at
      `, [userId, nextRevision, JSON.stringify(payload)]);
      await client.query("commit");
      return { revision: nextRevision, updatedAt: new Date(result.rows[0].updated_at).toISOString() };
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private assertLockedRules(previous: any, next: any) {
    if (!previous || !next) return;
    const lockedNotes = new Set<string>((previous.notes || [])
      .filter((note: any) => note.generationState === "completed" || note.sourcesLockedAt)
      .map((note: any) => note.id));
    for (const noteId of lockedNotes) {
      const sourceSignature = (payload: any) => JSON.stringify((payload.sources || [])
        .filter((source: any) => source.noteId === noteId)
        .sort((a: any, b: any) => Number(a.order || 0) - Number(b.order || 0))
        .map((source: any) => ({ id: source.id, fileName: source.fileName, order: source.order, parseStatus: source.parseStatus, textCharCount: source.textCharCount })));
      const profileSignature = (payload: any) => JSON.stringify((payload.profiles || []).find((profile: any) => profile.noteId === noteId) || null);
      if (sourceSignature(previous) !== sourceSignature(next) || profileSignature(previous) !== profileSignature(next)) {
        const error = new Error("这份笔记的资料或学习偏好已经锁定，服务端拒绝修改。") as Error & { status?: number; code?: string };
        error.status = 423;
        error.code = "learning_inputs_locked";
        throw error;
      }
    }
  }

  async close() {
    await this.pool.end();
  }
}
