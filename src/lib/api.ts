import { clearSession, getAccessToken } from "./auth";
import { API_URL } from "./config";

export class ApiError extends Error {}

function expireSession(): void {
  clearSession();
  if (window.location.hash || window.location.search || window.location.pathname !== "/") {
    window.location.assign("/");
    return;
  }
  window.location.reload();
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  const headers = new Headers(init.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
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
