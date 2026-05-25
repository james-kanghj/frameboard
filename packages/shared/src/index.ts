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
  riceScore: RICEScoreData | null;
}

// Mirrors backend WorkspaceRead.
export interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

// ---------- Input shapes (FE → BE; the api client snake_cases keys) ----------

export interface CreateWorkspaceInput {
  name: string;
  ownerEmail: string;
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
