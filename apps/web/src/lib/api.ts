// /apps/web/src/lib/api.ts

import type {
  BacklogItem,
  CreateItemInput,
  CreateWorkspaceInput,
  ExportResult,
  Framework,
  InviteMemberInput,
  ItemHistoryEntry,
  ScoreData,
  ScoreRequestInput,
  ScoreRICEInput,
  ScoreResult,
  UpdateItemInput,
  UpdateWorkspaceInput,
  UserMe,
  UserMeUpdateInput,
  Workspace,
  WorkspaceMember,
} from "@frameboard/shared";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

// ---------- snake_case <-> camelCase ----------

function toCamel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

function toSnake(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

// Cross-realm-safe plain-object check. The Next.js edge runtime parses
// fetch JSON in a different V8 realm than the page's `Object`, so the more
// common `value.constructor === Object` returns false even for plain
// objects — leaving snake_case keys untouched on the SSR path while the
// browser path camelCases them correctly. `Object.prototype.toString`
// reads the value's own [[Class]] slot, which is invariant across realms.
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function transformKeys<T>(input: unknown, fn: (key: string) => string): T {
  if (Array.isArray(input)) {
    return input.map((v) => transformKeys<unknown>(v, fn)) as T;
  }
  if (isPlainObject(input)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) {
      out[fn(k)] = transformKeys<unknown>(v, fn);
    }
    return out as T;
  }
  return input as T;
}

export const camelize = <T>(value: unknown): T => transformKeys<T>(value, toCamel);
export const snakeize = <T>(value: unknown): T => transformKeys<T>(value, toSnake);

// ---------- auth token plumbing ----------

const COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

// Browser-side cache so we don't hit /api/token on every fetch.
// Cleared on visibility-change so a fresh sign-in is picked up fast.
let clientCachedToken: string | null = null;
let clientCachedAt = 0;
const CLIENT_CACHE_TTL_MS = 5 * 60 * 1000;

if (typeof window !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      clientCachedToken = null;
    }
  });
}

async function getAuthToken(): Promise<string | null> {
  if (typeof window === "undefined") {
    // Server-side: read the NextAuth cookie directly. Dynamic import
    // keeps `next/headers` out of any client bundles that pull api.ts.
    try {
      const { cookies } = await import("next/headers");
      const jar = await cookies();
      for (const name of COOKIE_NAMES) {
        const c = jar.get(name);
        if (c?.value) return c.value;
      }
    } catch {
      // Outside a request scope (e.g. unit tests) — silently fall
      // through. The backend's AUTH_DISABLED=1 mode will still let
      // calls through without an Authorization header.
    }
    return null;
  }
  if (
    clientCachedToken &&
    Date.now() - clientCachedAt < CLIENT_CACHE_TTL_MS
  ) {
    return clientCachedToken;
  }
  try {
    const response = await fetch("/api/token", { credentials: "include" });
    if (!response.ok) return null;
    const { token } = (await response.json()) as { token?: string };
    if (!token) return null;
    clientCachedToken = token;
    clientCachedAt = Date.now();
    return token;
  } catch {
    return null;
  }
}

// ---------- fetch wrapper ----------

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | undefined>;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query } = opts;

  const url = new URL(`${API_BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, value);
      }
    }
  }

  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const token = await getAuthToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const init: RequestInit = {
    method,
    headers,
    cache: "no-store",
  };
  if (body !== undefined) {
    init.body = JSON.stringify(snakeize(body));
  }

  const response = await fetch(url.toString(), init);

  if (!response.ok) {
    let parsedBody: unknown;
    let detail: string;
    try {
      parsedBody = await response.json();
      detail =
        parsedBody !== null &&
        typeof parsedBody === "object" &&
        "detail" in parsedBody
          ? String((parsedBody as { detail: unknown }).detail)
          : JSON.stringify(parsedBody);
    } catch {
      detail = (await response.text().catch(() => "")) || response.statusText;
    }
    throw new ApiError(
      response.status,
      `${method} ${path} failed (${response.status}): ${detail}`,
      parsedBody,
    );
  }

  if (response.status === 204) return undefined as T;

  const payload = await response.json();
  return camelize<T>(payload);
}

// ---------- Workspaces ----------

export function listWorkspaces(): Promise<Workspace[]> {
  // Owner is derived from the authenticated session — no query needed.
  return request<Workspace[]>("/v1/workspaces");
}

export function createWorkspace(input: CreateWorkspaceInput): Promise<Workspace> {
  return request<Workspace>("/v1/workspaces", { method: "POST", body: input });
}

export function getWorkspace(workspaceId: string): Promise<Workspace> {
  return request<Workspace>(`/v1/workspaces/${workspaceId}`);
}

export function updateWorkspace(
  workspaceId: string,
  input: UpdateWorkspaceInput,
): Promise<Workspace> {
  return request<Workspace>(`/v1/workspaces/${workspaceId}`, {
    method: "PATCH",
    body: input,
  });
}

export function getWorkspaceBoard(workspaceId: string): Promise<BacklogItem[]> {
  return request<BacklogItem[]>(`/v1/workspaces/${workspaceId}/board`);
}

// ---------- Backlog items ----------

export function createItem(
  workspaceId: string,
  input: CreateItemInput,
): Promise<BacklogItem> {
  return request<BacklogItem>(`/v1/workspaces/${workspaceId}/items`, {
    method: "POST",
    body: input,
  });
}

export function updateItem(
  itemId: string,
  input: UpdateItemInput,
): Promise<BacklogItem> {
  return request<BacklogItem>(`/v1/items/${itemId}`, {
    method: "PATCH",
    body: input,
  });
}

export function deleteItem(itemId: string): Promise<void> {
  return request<void>(`/v1/items/${itemId}`, { method: "DELETE" });
}

export function fetchItemHistory(itemId: string): Promise<ItemHistoryEntry[]> {
  return request<ItemHistoryEntry[]>(`/v1/items/${itemId}/history`);
}

// ---------- RICE scoring ----------

export function scoreRICE(input: ScoreRICEInput): Promise<ScoreResult> {
  return request<ScoreResult>("/v1/score/rice", { method: "POST", body: input });
}

export function deleteRICE(itemId: string): Promise<void> {
  return request<void>(`/v1/items/${itemId}/rice`, { method: "DELETE" });
}

// Unified scoring endpoint — works for every supported framework.
// Returns the persisted ScoreData (item_id, framework, inputs, score,
// updated_at). For RICE the backend still mirrors the value into the
// legacy rice_scores table so the existing board read path keeps
// working.
export function scoreItem(input: ScoreRequestInput): Promise<ScoreData> {
  return request<ScoreData>("/v1/score", { method: "POST", body: input });
}

// Clear a polymorphic (ICE / MoSCoW / ValueEffort) score. For RICE
// callers should use deleteRICE(); both ultimately land on the same
// backend table for RICE but the legacy /rice endpoint keeps the
// history-log hook firing correctly.
export function deleteScore(
  itemId: string,
  framework: Framework,
): Promise<void> {
  return request<void>(`/v1/items/${itemId}/score`, {
    method: "DELETE",
    query: { framework },
  });
}

// ---------- User settings ----------

export function getMe(): Promise<UserMe> {
  return request<UserMe>("/v1/users/me");
}

export function updateMe(input: UserMeUpdateInput): Promise<UserMe> {
  return request<UserMe>("/v1/users/me", { method: "PATCH", body: input });
}

// ---------- Exports ----------

export function exportToNotion(workspaceId: string): Promise<ExportResult> {
  return request<ExportResult>(
    `/v1/workspaces/${workspaceId}/export/notion`,
    { method: "POST" },
  );
}

export function exportToLinear(workspaceId: string): Promise<ExportResult> {
  return request<ExportResult>(
    `/v1/workspaces/${workspaceId}/export/linear`,
    { method: "POST" },
  );
}

// ---------- Workspace members ----------

export function listMembers(
  workspaceId: string,
): Promise<WorkspaceMember[]> {
  return request<WorkspaceMember[]>(
    `/v1/workspaces/${workspaceId}/members`,
  );
}

export function inviteMember(
  workspaceId: string,
  input: InviteMemberInput,
): Promise<WorkspaceMember> {
  return request<WorkspaceMember>(
    `/v1/workspaces/${workspaceId}/members`,
    { method: "POST", body: input },
  );
}

export function removeMember(
  workspaceId: string,
  userId: string,
): Promise<void> {
  return request<void>(
    `/v1/workspaces/${workspaceId}/members/${userId}`,
    { method: "DELETE" },
  );
}
