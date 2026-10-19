import { API_URL } from "./config";
const STORAGE_KEY = "promethixia-auth";

export const BRAND_NAME = "Promethixia";
export const DEMO_MAILTO = "mailto:contacto@promethixia.com?subject=Solicitar%20demostración";
export const LANDING_URL = import.meta.env.VITE_LANDING_URL || "";

export interface SignInResult {
  email: string | null;
  error: string | null;
}

interface StoredSession {
  accessToken: string;
  email: string;
}

const preference = { remember: true };

const storage = {
  getItem(key: string): string | null {
    return localStorage.getItem(key) ?? sessionStorage.getItem(key);
  },
  setItem(key: string, value: string): void {
    const target = preference.remember ? localStorage : sessionStorage;
    const other = preference.remember ? sessionStorage : localStorage;
    other.removeItem(key);
    target.setItem(key, value);
  },
  removeItem(key: string): void {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  },
};

function readSession(): StoredSession | null {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed.accessToken || !parsed.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveSession(session: StoredSession, remember: boolean): void {
  preference.remember = remember;
  storage.setItem(STORAGE_KEY, JSON.stringify(session));
}

async function readError(response: Response): Promise<string> {
  const data = await response.json().catch(() => null);
  const detail = data && typeof data === "object" ? (data as { detail?: unknown }).detail : null;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: string };
    if (first.msg) return first.msg;
  }
  return "No pudimos completar la solicitud.";
}

export async function signIn(email: string, password: string, remember: boolean): Promise<SignInResult> {
  const response = await fetch(`${API_URL}/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, remember }),
  });
  if (!response.ok) {
    return { email: null, error: await readError(response) };
  }
  const data = (await response.json()) as { access_token: string; user: { email: string } };
  saveSession({ accessToken: data.access_token, email: data.user.email }, remember);
  return { email: data.user.email, error: null };
}

export async function restoreSession(): Promise<{ user: { email: string } } | null> {
  const session = readSession();
  if (!session) return null;

  const response = await fetch(`${API_URL}/users/me`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  if (!response.ok) {
    storage.removeItem(STORAGE_KEY);
    return null;
  }
  const user = (await response.json()) as { email: string };
  return { user: { email: user.email } };
}

export function getAccessToken(): string | null {
  return readSession()?.accessToken ?? null;
}

export async function signOut(): Promise<void> {
  storage.removeItem(STORAGE_KEY);
}
