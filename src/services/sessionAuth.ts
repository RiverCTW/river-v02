import type { AuthUser } from "../types";

const TOKEN_KEY = "river.tab.sessionToken.v021";
const USER_KEY = "river.tab.authUser.v021";

export function getTabSessionToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getTabAuthUser(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) as AuthUser : null;
  } catch {
    return null;
  }
}

export function setTabSession(token: string, user: AuthUser) {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearTabSession() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  } catch {
    // Storage can be unavailable in hardened browser modes.
  }
}

export function authHeaders(): Record<string, string> {
  const token = getTabSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
