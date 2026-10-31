import { authHeaders } from "./auth";
import { api, apiErrorMessage, ApiError } from "./api";
import { API_URL } from "./config";

function filenameFrom(response: Response, fallbackName: string): string {
  const header = response.headers.get("Content-Disposition") || "";
  const match = header.match(/filename="?([^"]+)"?/i);
  return response.headers.get("X-License-Filename") || match?.[1] || fallbackName;
}

async function saveBlob(response: Response, fallbackName: string): Promise<string> {
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const detail = data && typeof data === "object" ? (data as { detail?: unknown }).detail : null;
    throw new ApiError(apiErrorMessage(detail, "No pudimos descargar el archivo."));
  }
  const filename = filenameFrom(response, fallbackName);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return filename;
}

export async function downloadAuthenticated(path: string, fallbackName: string): Promise<string> {
  const response = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: authHeaders(),
  });
  return saveBlob(response, fallbackName);
}

export async function downloadAuthenticatedPost(path: string, body: unknown, fallbackName: string): Promise<string> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: authHeaders({ "Content-Type": "application/json" }, "POST"),
    body: JSON.stringify(body),
  });
  return saveBlob(response, fallbackName);
}

export async function downloadDesktopInstaller(channel: string, userId?: number): Promise<string> {
  const qs = `channel=${encodeURIComponent(channel)}`;
  const infoPath = userId != null ? `/desktop/${userId}/link?${qs}` : `/desktop/link?${qs}`;
  const info = await api<{ local: boolean; url: string; filename: string }>(infoPath);
  if (info.local) {
    const filePath = userId != null ? `/desktop/${userId}/installer?${qs}` : `/desktop/installer?${qs}`;
    return downloadAuthenticated(filePath, info.filename);
  }
  if (!info.url) {
    throw new ApiError("Aún no está el instalador en el servidor.");
  }
  const link = document.createElement("a");
  link.href = info.url;
  link.rel = "noopener";
  link.target = "_blank";
  document.body.appendChild(link);
  link.click();
  link.remove();
  return info.filename;
}
