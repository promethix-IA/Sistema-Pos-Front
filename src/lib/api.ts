import { authFetchInit, authHeaders, clearSession, signOut } from "./auth";
import { API_URL } from "./config";

export class ApiError extends Error {}

export function apiErrorMessage(detail: unknown, fallback = "No pudimos completar la solicitud."): string {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const first = detail.find((item) => item && typeof item === "object" && "msg" in item) as { msg?: string } | undefined;
    if (typeof first?.msg === "string" && first.msg.trim()) return first.msg;
  }
  return fallback;
}

function expireSession(): void {
  void signOut();
  clearSession();
  if (window.location.hash || window.location.search || window.location.pathname !== "/") {
    window.location.assign("/");
    return;
  }
  window.location.reload();
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method || "GET").toUpperCase();
  const headers = authHeaders(init.headers, method);
  if (!headers.has("Content-Type") && init.body != null) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    ...authFetchInit,
    headers,
  });
  if (response.status === 401) {
    expireSession();
    throw new ApiError("La sesión expiró. Vuelve a iniciar sesión.");
  }
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = data && typeof data === "object" ? (data as { detail?: unknown }).detail : null;
    throw new ApiError(apiErrorMessage(detail));
  }
  return data as T;
}
