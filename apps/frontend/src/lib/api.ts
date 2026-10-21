/**
 * Thin fetch wrapper for the SecureVote REST API.
 *  - credentials: "include" sends the HttpOnly session cookie (JavaScript cannot read it)
 *  - every state-changing request carries the CSRF header required by the backend
 *  - errors are converted into ApiError with the server's safe error code/message
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export async function apiRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") headers["X-SecureVote-CSRF"] = "1";
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      credentials: "include",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Cannot reach the SecureVote API. Is the backend running?");
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError(res.status, "BAD_RESPONSE", `Unexpected response from server (HTTP ${res.status})`);
  }
  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    throw new ApiError(
      res.status,
      err?.code ?? "HTTP_ERROR",
      err?.message ?? `Request failed (HTTP ${res.status})`,
      err?.details,
    );
  }
  return json as T;
}

export const api = {
  get: <T>(path: string) => apiRequest<T>("GET", path),
  post: <T>(path: string, body?: unknown) => apiRequest<T>("POST", path, body ?? {}),
  put: <T>(path: string, body?: unknown) => apiRequest<T>("PUT", path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>("PATCH", path, body ?? {}),
  del: <T>(path: string) => apiRequest<T>("DELETE", path),
};
