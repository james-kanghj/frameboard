// /packages/shared/src/index.ts

export type Framework = "RICE" | "ICE" | "MoSCoW" | "ValueEffort" | "Kano";

export type RICEImpact = 0.25 | 0.5 | 1 | 2 | 3;

// Response from the backend's RICEScoreRead.
export interface RICEScoreData {
  reach: number;
  impact: RICEImpact;
  confidence: number;
  effort: number;
  score: number;
  updatedAt: string;
}

// Mirrors backend BacklogItemRead.
export interface BacklogItem {
  id: string;
  workspaceId: string;
  title: string;
  description: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  // Null = open / not yet shipped. Timestamp = when the item was
  // checked off.
  completedAt: string | null;
  // RICE-specific score from the legacy `rice_scores` table. Populated
  // for RICE workspaces.
  riceScore: RICEScoreData | null;
  // Polymorphic score for non-RICE frameworks. Populated by the board
  // endpoint when the workspace uses ICE / MoSCoW / ValueEffort.
  score?: ScoreData | null;
}

// Mirrors backend WorkspaceRead.
export interface Workspace {
  id: string;
  name: string;
  framework: Framework;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateWorkspaceInput {
  name?: string;
  framework?: Framework;
}

// ---------- Input shapes (FE → BE; the api client snake_cases keys) ----------

export interface CreateWorkspaceInput {
  name: string;
  // Optional — the backend defaults to RICE. Pass when creating a
  // workspace for a non-default framework.
  framework?: Framework;
}

// Polymorphic score envelope returned by the unified board endpoint
// for non-RICE workspaces. RICE workspaces continue to use `riceScore`
// on BacklogItem.
export interface ScoreData {
  itemId: string;
  framework: Framework;
  inputs: Record<string, unknown>;
  score: number;
  updatedAt: string;
}

export interface ScoreRequestInput {
  itemId: string;
  framework: Framework;
  inputs: Record<string, unknown>;
}

// Mirrors backend UserMeRead. The raw access token is intentionally
// absent — the API only returns whether one is configured.
export interface UserMe {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  notionConfigured: boolean;
  notionDatabaseId: string | null;
  linearConfigured: boolean;
  linearTeamId: string | null;
}

export interface UserMeUpdateInput {
  // Empty string = disconnect, non-empty = set, omitted = leave alone.
  notionAccessToken?: string;
  notionDatabaseId?: string;
  linearApiKey?: string;
  linearTeamId?: string;
}

export interface ExportFailure {
  title: string;
  error: string;
}

export interface ExportResult {
  created: number;
  failed: number;
  failures: ExportFailure[];
}

export interface CreateItemInput {
  title: string;
  description?: string | null;
  tags?: string[];
}

export interface UpdateItemInput {
  title?: string;
  description?: string | null;
  // `null` is not allowed here — backend treats undefined as "leave alone"
  // and an empty array `[]` as "clear all tags".
  tags?: string[];
  // Omitted → leave alone. `null` → mark item as open (clear
  // completion). ISO string → mark completed at that moment.
  completedAt?: string | null;
}

export interface ScoreRICEInput {
  itemId: string;
  reach: number;
  impact: RICEImpact;
  confidence: number;
  effort: number;
}

// ICE remains unpersisted on the backend; itemId is free-form.
export interface ScoreICEInput {
  itemId: string;
  impact: number;
  confidence: number;
  ease: number;
}

// Response from POST /v1/score/{rice,ice}.
export interface ScoreResult {
  framework: Framework;
  itemId: string;
  score: number;
  breakdown: Record<string, number>;
}

// Mirrors backend ItemHistoryEntry. Append-only timeline of changes for
// a single backlog item. `kind = "score"` rows carry RICE numbers in
// before/after; `kind = "fields"` rows carry only the changed item
// fields (title/description/tags). `before === null` means first ever
// scoring; `after === null` means the score was cleared.
export interface ItemHistoryEntry {
  id: string;
  itemId: string;
  changedAt: string;
  kind: "score" | "fields";
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}
