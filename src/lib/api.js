import { supabase } from "./supabaseClient";

/* ============================================================
   EduChess API client
   ------------------------------------------------------------
   Thin wrapper around fetch for the Python backend. Attaches the
   Supabase access token the user already holds, so the backend can
   verify who they are without a second auth system.

   Keep using supabase-js directly for plain reads/writes that RLS
   already protects. Route through here only for things the browser
   must not be trusted with — payment verification, signed URLs for
   paid video, AI calls, video jobs.
   ============================================================ */

const BASE_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiFetch(path, { method = "GET", body, signal, auth = true } = {}) {
  if (!BASE_URL) {
    throw new ApiError("VITE_API_URL is not set, so backend calls are disabled.", 0, null);
  }

  const headers = { ...(auth ? await authHeader() : {}) };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

  const text = await res.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    // FastAPI puts the message in `detail`.
    const message =
      (parsed && typeof parsed === "object" && parsed.detail) ||
      (typeof parsed === "string" && parsed) ||
      `Request failed (${res.status})`;
    throw new ApiError(message, res.status, parsed);
  }

  return parsed;
}

export const api = {
  get: (path, opts) => apiFetch(path, { ...opts, method: "GET" }),
  post: (path, body, opts) => apiFetch(path, { ...opts, method: "POST", body }),
  patch: (path, body, opts) => apiFetch(path, { ...opts, method: "PATCH", body }),
  del: (path, opts) => apiFetch(path, { ...opts, method: "DELETE" }),

  /** Backend liveness + config check. No auth required. */
  health: () => apiFetch("/health", { auth: false }),
  /** Verifies the JWT bridge — returns the caller's id/email, or 401. */
  me: () => apiFetch("/me"),
};
