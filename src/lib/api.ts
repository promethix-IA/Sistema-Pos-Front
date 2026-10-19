import { getAccessToken } from "./auth";
import { API_URL } from "./config";

export class ApiError extends Error {}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = data && typeof data === "object" ? (data as { detail?: unknown }).detail : null;
    const message = typeof detail === "string" ? detail : "No pudimos completar la solicitud.";
    throw new ApiError(message);
  }
  return data as T;
}
