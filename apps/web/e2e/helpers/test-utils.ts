// /apps/web/e2e/helpers/test-utils.ts

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_API_BASE_URL = "http://localhost:8001";
const DEFAULT_TEST_USER_EMAIL = "[email protected]";

// The test must talk to the same "current user" the page renders for. Until
// real auth lands, that user comes from NEXT_PUBLIC_DEV_USER_EMAIL in
// apps/web/.env.development.local. Playwright's runner doesn't auto-load
// Next's dotenv files, so we read it directly here.
function readWebEnvFile(): Record<string, string> {
  const envPath = resolve(process.cwd(), ".env.development.local");
  if (!existsSync(envPath)) return {};
  const out: Record<string, string> = {};
  for (const raw of readFileSync(envPath, "utf-8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    out[key] = value;
  }
  return out;
}

const envFile = readWebEnvFile();

export function getTestUserEmail(): string {
  return (
    process.env.E2E_USER_EMAIL ??
    envFile.NEXT_PUBLIC_DEV_USER_EMAIL ??
    DEFAULT_TEST_USER_EMAIL
  );
}

function getApiBaseUrl(): string {
  return (
    process.env.PLAYWRIGHT_API_URL ??
    process.env.E2E_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    envFile.NEXT_PUBLIC_API_BASE_URL ??
    DEFAULT_API_BASE_URL
  );
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = `${getApiBaseUrl()}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `${init.method ?? "GET"} ${path} → ${response.status} ${body}`,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// Wipes all workspaces (cascade-deletes items + scores) for the given user
// and ensures the user row exists. Requires the backend to be running with
// FRAMEBOARD_TEST_MODE=1 — otherwise the /v1/_test/reset route is 404.
export async function resetBackend(ownerEmail: string): Promise<void> {
  const url = `${getApiBaseUrl()}/v1/_test/reset`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner_email: ownerEmail }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `resetBackend failed: POST ${url} → ${response.status} ${body}\n` +
        `Hint: did you start the backend with FRAMEBOARD_TEST_MODE=1?`,
    );
  }
}

// ─────────────────────────────────────────────────────────────── Seed helpers ──

// Seed via API rather than UI for speed: clicking through Create-workspace
// + Add-item is ~3 s per call and not what most tests are actually verifying.

export async function seedWorkspace(name: string): Promise<string> {
  const data = await api<{ id: string }>("/v1/workspaces", {
    method: "POST",
    body: JSON.stringify({ name, owner_email: getTestUserEmail() }),
  });
  return data.id;
}

export async function seedItem(
  workspaceId: string,
  title: string,
  description: string | null = null,
): Promise<string> {
  const data = await api<{ id: string }>(
    `/v1/workspaces/${workspaceId}/items`,
    {
      method: "POST",
      body: JSON.stringify({ title, description }),
    },
  );
  return data.id;
}

export interface RICEInput {
  reach: number;
  impact: number;
  confidence: number;
  effort: number;
}

export async function seedScore(
  itemId: string,
  rice: RICEInput,
): Promise<number> {
  const data = await api<{ score: number }>("/v1/score/rice", {
    method: "POST",
    body: JSON.stringify({
      item_id: itemId,
      reach: rice.reach,
      impact: rice.impact,
      confidence: rice.confidence,
      effort: rice.effort,
    }),
  });
  return data.score;
}
