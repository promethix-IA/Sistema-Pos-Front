import { API_URL } from "./config";

const LEGACY_STORAGE_KEY = "promethixia-auth";
const CSRF_COOKIE = "pos_csrf";

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
  if (role === "admin") return "Plataforma";
  if (role === "owner" || role === "administrador") return "Administrador";
  if (role === "inventario") return "Inventario";
  if (role === "cajero" || role === "cashier") return "Cajero";
  return "Administrador";
}

export interface SignInResult {
  email: string | null;
  role: UserRole | null;
  error: string | null;
}

function asRole(value: unknown): UserRole {
  if (value === "cashier") return "cajero";
  if (value === "admin" || value === "owner" || value === "administrador" || value === "cajero" || value === "inventario") {
    return value;
  }
  return "owner";
}

function wipeLegacyTokenStorage() {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    sessionStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* private mode */
  }
}

wipeLegacyTokenStorage();

export function readCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const prefix = `${CSRF_COOKIE}=`;
  const row = document.cookie.split("; ").find(part => part.startsWith(prefix));
  if (!row) return "";
  try {
    return decodeURIComponent(row.slice(prefix.length));
  } catch {
    return row.slice(prefix.length);
  }
}

export function authHeaders(init?: HeadersInit, method = "GET"): Headers {
  const headers = new Headers(init);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  const unsafe = !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
  if (unsafe) {
    const csrf = readCsrfToken();
    if (csrf && !headers.has("X-CSRF-Token")) headers.set("X-CSRF-Token", csrf);
  }
  return headers;
}

export const authFetchInit: Pick<RequestInit, "credentials"> = {
  credentials: "include",
};

export function clearSession(): void {
  wipeLegacyTokenStorage();
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

async function postPassword(path: string, body: object): Promise<string | null> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: authHeaders({ "Content-Type": "application/json" }, "POST"),
    body: JSON.stringify(body),
  });
  if (!response.ok) return readError(response);
  return null;
}

export async function requestPasswordReset(email: string): Promise<string | null> {
  return postPassword("/users/password/forgot", { email });
}

export async function verifyPasswordReset(email: string, code: string): Promise<string | null> {
  return postPassword("/users/password/verify", { email, code });
}

export async function resetPassword(email: string, code: string, password: string): Promise<string | null> {
  return postPassword("/users/password/reset", { email, code, password });
}

export async function signIn(email: string, password: string, remember: boolean): Promise<SignInResult> {
  const response = await fetch(`${API_URL}/users/login`, {
    method: "POST",
    credentials: "include",
    headers: authHeaders({ "Content-Type": "application/json" }, "POST"),
    body: JSON.stringify({ email, password, remember }),
  });
  if (!response.ok) {
    return { email: null, role: null, error: await readError(response) };
  }
  wipeLegacyTokenStorage();
  const data = (await response.json()) as { user?: { email: string; role?: string } };
  if (!data.user?.email) {
    return { email: null, role: null, error: "No pudimos iniciar sesión. Intenta de nuevo." };
  }
  return { email: data.user.email, role: asRole(data.user.role), error: null };
}

export async function restoreSession(): Promise<{ user: { email: string; role: UserRole } } | null> {
  wipeLegacyTokenStorage();
  const response = await fetch(`${API_URL}/users/me`, {
    credentials: "include",
    headers: authHeaders(),
  });
  if (!response.ok) {
    clearSession();
    return null;
  }
  const user = (await response.json()) as { email: string; role?: string };
  return { user: { email: user.email, role: asRole(user.role) } };
}

/** El JWT ya no se guarda en el navegador; vive en una cookie httpOnly. */
export function getAccessToken(): string | null {
  return null;
}

export async function signOut(): Promise<void> {
  try {
    await fetch(`${API_URL}/users/logout`, {
      method: "POST",
      credentials: "include",
      headers: authHeaders({ "Content-Type": "application/json" }, "POST"),
      body: "{}",
    });
  } catch {
    /* still drop local leftovers */
  }
  clearSession();
}
