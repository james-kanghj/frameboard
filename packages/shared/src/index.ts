/packages/shared/src/index.ts

export type Framework = "RICE" | "ICE" | "MoSCoW" | "ValueEffort" | "Kano";

export interface BacklogItem {
  id: string;
  title: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RICEScore {
  reach: number;
  impact: 0.25 | 0.5 | 1 | 2 | 3;
  confidence: number;
  effort: number;
}

export interface ICEScore {
  impact: number;
  confidence: number;
  ease: number;
}

export interface ScoreResult {
  framework: Framework;
  itemId: string;
  score: number;
  breakdown: Record<string, number>;
}
