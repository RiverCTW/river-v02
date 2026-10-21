import type { AuthUser } from "../types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
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
  try {
    const result = await request<{ authenticated: boolean; user?: AuthUser }>("/api/auth/me");
    return result.authenticated && result.user ? result.user : null;
  } catch (error) {
    if ((error as { status?: number }).status === 401) return null;
    throw error;
  }
}

export async function login(username: string, password: string): Promise<AuthUser> {
  const result = await request<{ user: AuthUser }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  return result.user;
}

export async function logout(): Promise<void> {
  await request("/api/auth/logout", { method: "POST", body: "{}" });
}

export async function createUserAccount(username: string, password: string): Promise<AuthUser> {
  const result = await request<{ user: AuthUser }>("/api/admin/users", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  return result.user;
}

export async function listUserAccounts(): Promise<AuthUser[]> {
  const result = await request<{ users: AuthUser[] }>("/api/admin/users");
  return result.users;
}
