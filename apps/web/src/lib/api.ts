// /apps/web/src/lib/api.ts

import type {
  BacklogItem,
  CreateItemInput,
  CreateWorkspaceInput,
  ScoreRICEInput,
  ScoreResult,
  UpdateItemInput,
  Workspace,
  WorkspaceDetail,
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

function transformKeys<T>(input: unknown, fn: (key: string) => string): T {
  if (Array.isArray(input)) {
    return input.map((v) => transformKeys<unknown>(v, fn)) as T;
  }
  if (
    input !== null &&
    typeof input === "object" &&
    (input as object).constructor === Object
  ) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[fn(k)] = transformKeys<unknown>(v, fn);
    }
    return out as T;
  }
  return input as T;
}

export const camelize = <T>(value: unknown): T => transformKeys<T>(value, toCamel);
export const snakeize = <T>(value: unknown): T => transformKeys<T>(value, toSnake);

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

  const init: RequestInit = {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
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

export function listWorkspaces(ownerEmail?: string): Promise<Workspace[]> {
  return request<Workspace[]>("/v1/workspaces", {
    query: { owner_email: ownerEmail },
  });
}

export function createWorkspace(input: CreateWorkspaceInput): Promise<Workspace> {
  return request<Workspace>("/v1/workspaces", { method: "POST", body: input });
}

export function getWorkspace(workspaceId: string): Promise<WorkspaceDetail> {
  return request<WorkspaceDetail>(`/v1/workspaces/${workspaceId}`);
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

// ---------- RICE scoring ----------

export function scoreRICE(input: ScoreRICEInput): Promise<ScoreResult> {
  return request<ScoreResult>("/v1/score/rice", { method: "POST", body: input });
}

export function deleteRICE(itemId: string): Promise<void> {
  return request<void>(`/v1/items/${itemId}/rice`, { method: "DELETE" });
}
