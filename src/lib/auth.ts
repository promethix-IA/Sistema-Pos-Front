import { API_URL } from "./config";
const STORAGE_KEY = "promethixia-auth";

export const BRAND_NAME = "Promethixia";
export const CONTACT_EMAIL = "promethixia@gmail.com";
export const DEMO_MAILTO =
  "mailto:promethixia@gmail.com?subject=" +
  encodeURIComponent("Quiero una prueba gratis de 15 días") +
  "&body=" +
  encodeURIComponent("Hola Promethixia, quiero una prueba gratis de 15 días para mirar el software.\n\nNombre del negocio:\nCiudad:\n");
export const LANDING_URL = import.meta.env.VITE_LANDING_URL || "";

export type UserRole = "admin" | "owner" | "administrador" | "cajero" | "inventario";

export const BUSINESS_ROLES: { id: Exclude<UserRole, "admin" | "owner">; label: string }[] = [
  { id: "administrador", label: "Administrador" },
  { id: "cajero", label: "Cajero" },
  { id: "inventario", label: "Inventario" },
];

const ALL_MODULES = [
  "dashboard",
  "productos",
  "inventario",
  "clientes",
  "proveedores",
  "ventas",
  "cierre",
  "creditos",
  "integraciones",
  "usuarios",
] as const;

const ROLE_MODULES: Record<UserRole, readonly string[]> = {
  admin: ["usuarios"],
  owner: ALL_MODULES,
  administrador: ALL_MODULES,
  cajero: ["dashboard", "ventas", "cierre", "creditos", "clientes"],
  inventario: ["dashboard", "productos", "inventario", "proveedores"],
};

export function modulesForRole(role: UserRole): readonly string[] {
  return ROLE_MODULES[role] ?? ALL_MODULES;
}

export function roleLabel(role: UserRole | string | undefined): string {
  if (role === "admin") return "Admin";
  if (role === "owner") return "Padre";
  if (role === "administrador") return "Administrador";
  if (role === "inventario") return "Inventario";
  if (role === "cajero" || role === "cashier") return "Cajero";
  return "Padre";
}

export interface SignInResult {
  email: string | null;
  role: UserRole | null;
  error: string | null;
}

interface StoredSession {
  accessToken: string;
  email: string;
}

function asRole(value: unknown): UserRole {
  if (value === "cashier") return "cajero";
  if (value === "admin" || value === "owner" || value === "administrador" || value === "cajero" || value === "inventario") {
    return value;
  }
  return "owner";
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

function tokenExpired(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return true;
  try {
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(padded)) as { exp?: number; typ?: string };
    if (payload.typ && payload.typ !== "access") return true;
    if (typeof payload.exp !== "number") return true;
    return payload.exp * 1000 <= Date.now() + 5000;
  } catch {
    return true;
  }
}

function readSession(): StoredSession | null {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed.accessToken || !parsed.email) return null;
    if (tokenExpired(parsed.accessToken)) {
      storage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    storage.removeItem(STORAGE_KEY);
    return null;
  }
}

function saveSession(session: StoredSession, remember: boolean): void {
  preference.remember = remember;
  storage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  storage.removeItem(STORAGE_KEY);
}

async function readError(response: Response): Promise<string> {
  const data = await response.json().catch(() => null);
  const detail = data && typeof data === "object" ? (data as { detail?: unknown }).detail : null;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: string };
    if (first.msg) return first.msg;
  }
  if (response.status === 429) return "Demasiados intentos. Espera unos minutos e intenta de nuevo.";
  return "No pudimos completar la solicitud.";
}

export async function signIn(email: string, password: string, remember: boolean): Promise<SignInResult> {
  const response = await fetch(`${API_URL}/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, password, remember }),
  });
  if (!response.ok) {
    return { email: null, role: null, error: await readError(response) };
  }
  const data = (await response.json()) as { access_token: string; user: { email: string; role?: string } };
  if (!data.access_token) {
    return { email: null, role: null, error: "No pudimos iniciar sesión. Intenta de nuevo." };
  }
  saveSession({ accessToken: data.access_token, email: data.user.email }, remember);
  return { email: data.user.email, role: asRole(data.user.role), error: null };
}

export async function restoreSession(): Promise<{ user: { email: string; role: UserRole } } | null> {
  const session = readSession();
  if (!session) return null;

  const response = await fetch(`${API_URL}/users/me`, {
    headers: { Authorization: `Bearer ${session.accessToken}`, Accept: "application/json" },
  });
  if (!response.ok) {
    clearSession();
    return null;
  }
  const user = (await response.json()) as { email: string; role?: string };
  return { user: { email: user.email, role: asRole(user.role) } };
}

export function getAccessToken(): string | null {
  return readSession()?.accessToken ?? null;
}

export async function signOut(): Promise<void> {
  clearSession();
}
