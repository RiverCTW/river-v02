import type { AuthUser } from "../types";
import { authHeaders, clearTabSession, getTabSessionToken, getTabAuthUser, setTabSession } from "./sessionAuth";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...init,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...(init?.headers || {}) },
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(json?.error?.message || `请求失败：HTTP ${response.status}`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return json as T;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = getTabSessionToken();
  if (!token) return null;
  try {
    const result = await request<{ authenticated: boolean; user?: AuthUser }>("/api/auth/me", { headers: authHeaders() });
    if (result.authenticated && result.user) {
      // A duplicated tab inherits sessionStorage. Rotate once on boot so every
      // live tab owns a distinct server session and one logout cannot revoke it.
      const rotated = await request<{ authenticated: boolean; user: AuthUser; sessionToken: string }>("/api/auth/tab", {
        method: "POST", body: "{}", headers: authHeaders(),
      });
      setTabSession(rotated.sessionToken, rotated.user);
      return rotated.user;
    }
    return result.authenticated && result.user ? result.user : null;
  } catch (error) {
    if ((error as { status?: number }).status === 401) return null;
    throw error;
  }
}

export async function login(username: string, password: string): Promise<AuthUser> {
  const result = await request<{ user: AuthUser; sessionToken: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  if (!result.sessionToken) throw new Error("服务端没有返回标签页会话凭据。");
  setTabSession(result.sessionToken, result.user);
  return result.user;
}

export async function logout(): Promise<void> {
  const token = getTabSessionToken();
  clearTabSession();
  await request("/api/auth/logout", {
    method: "POST", body: "{}", headers: token ? { Authorization: `Bearer ${token}` } : {},
  }).catch(() => undefined);
}

export async function createUserAccount(username: string, password: string): Promise<AuthUser> {
  const result = await request<{ user: AuthUser }>("/api/admin/users", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ username, password }),
  });
  return result.user;
}

export async function listUserAccounts(): Promise<AuthUser[]> {
  const result = await request<{ users: AuthUser[] }>("/api/admin/users", { headers: authHeaders() });
  return result.users;
}
