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

// Mirrors backend WorkspaceDetail — includes items.
export interface WorkspaceDetail extends Workspace {
  items: BacklogItem[];
}

// ---------- Input shapes (FE → BE; the api client snake_cases keys) ----------

export interface CreateWorkspaceInput {
  name: string;
  ownerEmail: string;
}

export interface CreateItemInput {
  title: string;
  description?: string | null;
}

export interface UpdateItemInput {
  title?: string;
  description?: string | null;
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
