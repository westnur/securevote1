/**
 * Tiny HTTP client used by the demo scenario script. It behaves like the browser:
 * keeps the session cookie and sends the CSRF header on state-changing requests.
 */
export class ApiClient {
  private cookie = "";

  constructor(
    private readonly baseUrl: string,
    private readonly origin = "http://localhost:5173",
  ) {}

  async request<T = unknown>(method: string, path: string, body?: unknown): Promise<{ status: number; body: T }> {
    const headers: Record<string, string> = { Origin: this.origin };
    if (this.cookie) headers.Cookie = this.cookie;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (method !== "GET") headers["X-SecureVote-CSRF"] = "1";
    const res = await fetch(this.baseUrl + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const setCookie = res.headers.getSetCookie?.() ?? [];
    for (const c of setCookie) if (c.startsWith("sv_session=")) this.cookie = c.split(";")[0]!;
    const text = await res.text();
    return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
  }

  async expectOk<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const r = await this.request<T>(method, path, body);
    if (r.status >= 300) throw new Error(`${method} ${path} -> ${r.status}: ${JSON.stringify(r.body)}`);
    return r.body;
  }

  async login(email: string, password: string) {
    return this.expectOk("POST", "/api/auth/login", { email, password });
  }
}
