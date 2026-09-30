// Client side of the blog API (FE-33, BE-09). One relative base in every
// environment: in production the Bun server answers /api on the page's own
// origin, in development Vite proxies /api to the API process
// (vite.config.js). No absolute API URL and no CORS.
export const API_BASE = "/api";

// apiUrl('/posts') -> '/api/posts'. A path that already starts with the base
// ('/api/posts?lang=en', e.g. an swr key) is used as it is.
export function apiUrl(path = "") {
  const value = String(path);
  if (
    value === API_BASE ||
    value.startsWith(`${API_BASE}/`) ||
    value.startsWith(`${API_BASE}?`)
  ) {
    return value;
  }
  return `${API_BASE}${value.startsWith("/") ? "" : "/"}${value}`;
}

// A non-2xx answer. `status` is the HTTP status; `code` (and `issues`) come
// from the T-01 error envelope { error, code, issues? } when the body has one.
export class ApiError extends Error {
  constructor(message, { status, code, issues } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    if (code !== undefined) this.code = code;
    if (issues !== undefined) this.issues = issues;
  }
}

async function errorFrom(res) {
  let body = null;
  try {
    body = await res.json();
  } catch {
    // Not JSON (a proxy error page, an empty body): the status is enough.
  }
  const message =
    typeof body?.error === "string" && body.error !== ""
      ? body.error
      : `HTTP ${res.status}`;
  return new ApiError(message, {
    status: res.status,
    code: typeof body?.code === "string" ? body.code : undefined,
    issues: Array.isArray(body?.issues) ? body.issues : undefined,
  });
}

// getJson('/posts', { signal }) -> parsed JSON body. Rejects with ApiError
// on a non-2xx answer, with the fetch error on a network failure and with an
// AbortError when `signal` aborts. Also the swr fetcher (T-04, FE-12).
export async function getJson(path, { signal } = {}) {
  const res = await fetch(apiUrl(path), {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw await errorFrom(res);
  return res.json();
}
