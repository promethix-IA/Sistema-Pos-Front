import { authFetchInit, authHeaders, clearSession, signOut } from "./auth";
import { API_URL } from "./config";

export class ApiError extends Error {}

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
    const message = typeof detail === "string" ? detail : "No pudimos completar la solicitud.";
    throw new ApiError(message);
  }
  return data as T;
}
