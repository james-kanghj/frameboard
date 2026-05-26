// /apps/web/src/lib/framework-config.tsx
//
// Per-framework UI metadata: scoring inputs, the score formula, and the
// metric-legend copy. The board + edit modal both read from this map
// instead of hardcoding RICE-specific fields, so adding a new framework
// is a matter of (a) extending the Framework union in the shared
// package, (b) adding a backend score_engine branch, and (c) adding an
// entry here.

import type { ReactNode } from "react";

import type { Framework, RICEImpact } from "@frameboard/shared";

export interface NumberInputDef {
  key: string;
  label: string;
  type: "number";
  min?: number;
  max?: number;
  step?: number | "any";
  placeholder?: string;
}

export interface ImpactInputDef {
  key: "impact";
  label: string;
  type: "impact";
  // RICE-specific 0.25/0.5/1/2/3 select.
  options: RICEImpact[];
}

export interface BucketInputDef {
  key: string;
  label: string;
  type: "bucket";
  options: { value: string; label: string }[];
}

export type ScoreInputDef = NumberInputDef | ImpactInputDef | BucketInputDef;

export interface MetricEntry {
  term: string;
  def: string;
  detail: ReactNode;
}

export interface FrameworkConfig {
  framework: Framework;
  // Headline name shown in the workspace badge.
  displayName: string;
  // Compact formula displayed in the metric legend and modal hint.
  formula: string;
  // One-liner shown above the metric legend on the board - frames
  // *why* the user is filling in these inputs. Different shape than
  // `formula` (which is the bare math) so the prose can read
  // naturally.
  intro: string;
  // Input fields rendered in the edit modal / scoring form.
  inputs: ScoreInputDef[];
  // Pure compute mirroring the backend's score_engine. Returns null when
  // inputs are incomplete or invalid so callers can render "-" instead.
  scoreFn: (inputs: Record<string, unknown>) => number | null;
  // Metric-legend entries - small (i) tooltip explanations above the
  // table. Order = column order in the table.
  metrics: MetricEntry[];
  // Whether the Effort × Score scatter / Top-N bars chart applies.
  // Suppressed for MoSCoW (bucket ranks aren't meaningfully "scored")
  // and ICE (no Effort axis).
  showCharts: boolean;
  // Whether the Effort + Score bucket-filter chips apply.
  showEffortScoreFilters: boolean;
}

const RICE_INPUTS: ScoreInputDef[] = [
  { key: "reach", label: "Reach", type: "number", min: 0, step: "any", placeholder: "e.g. 1000" },
  {
    key: "impact",
    label: "Impact",
    type: "impact",
    options: [0.25, 0.5, 1, 2, 3],
  },
  {
    key: "confidence",
    label: "Confidence",
    type: "number",
    min: 0,
    max: 1,
    step: "any",
    placeholder: "0.0 – 1.0",
  },
  {
    key: "effort",
    label: "Effort",
    type: "number",
    min: 0.01,
    step: "any",
    placeholder: "Person-months",
  },
];

const ICE_INPUTS: ScoreInputDef[] = [
  { key: "impact", label: "Impact", type: "number", min: 0, max: 10, step: "any", placeholder: "1 – 10" },
  { key: "confidence", label: "Confidence", type: "number", min: 0, max: 10, step: "any", placeholder: "1 – 10" },
  { key: "ease", label: "Ease", type: "number", min: 0, max: 10, step: "any", placeholder: "1 – 10" },
];

const VALUE_EFFORT_INPUTS: ScoreInputDef[] = [
  { key: "value", label: "Value", type: "number", min: 0, step: "any", placeholder: "e.g. 8" },
  { key: "effort", label: "Effort", type: "number", min: 0.01, step: "any", placeholder: "e.g. 2" },
];

const MOSCOW_BUCKETS: BucketInputDef = {
  key: "bucket",
  label: "Bucket",
  type: "bucket",
  options: [
    { value: "Must", label: "Must" },
    { value: "Should", label: "Should" },
    { value: "Could", label: "Could" },
    { value: "Won't", label: "Won't" },
  ],
};

const MOSCOW_RANKS: Record<string, number> = {
  Must: 4,
  Should: 3,
  Could: 2,
  "Won't": 1,
};

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export const FRAMEWORK_CONFIGS: Record<Framework, FrameworkConfig> = {
  RICE: {
    framework: "RICE",
    displayName: "RICE",
    formula: "(Reach × Impact × Confidence) ÷ Effort",
    intro:
      "Grade each item on Reach × Impact × Confidence ÷ Effort to surface the highest-leverage work.",
    inputs: RICE_INPUTS,
    scoreFn(inputs) {
      const r = num(inputs.reach);
      const i = num(inputs.impact);
      const c = num(inputs.confidence);
      const e = num(inputs.effort);
      if (r === null || i === null || c === null || e === null) return null;
      if (e <= 0) return null;
      return Math.round(((r * i * c) / e) * 100) / 100;
    },
    metrics: [
      {
        term: "Reach",
        def: "People affected per period",
        detail: (
          <>
            <p className="font-medium text-slate-900">
              How many users (or events) are touched per time period.
            </p>
            <p className="mt-2">
              Pick a unit and use it consistently across the workspace -{" "}
              <em>per quarter</em> is the standard PM default.
            </p>
          </>
        ),
      },
      {
        term: "Impact",
        def: "0.25 (min) → 3 (massive)",
        detail: (
          <>
            <p className="font-medium text-slate-900">
              How much each affected user benefits. RICE uses a fixed
              five-point scale:
            </p>
            <ul className="mt-2 space-y-1">
              <li><span className="font-mono">0.25</span> - minimal</li>
              <li><span className="font-mono">0.5</span> - low</li>
              <li><span className="font-mono">1</span> - medium</li>
              <li><span className="font-mono">2</span> - high</li>
              <li><span className="font-mono">3</span> - massive</li>
            </ul>
          </>
        ),
      },
      {
        term: "Confidence",
        def: "0.0 – 1.0 belief",
        detail: (
          <p>Your confidence in the other three numbers (0–1).</p>
        ),
      },
      {
        term: "Effort",
        def: "Person-months (> 0)",
        detail: (
          <p>How long one team member would take to ship this end-to-end.</p>
        ),
      },
      {
        term: "Score",
        def: "(R × I × C) ÷ E",
        detail: (
          <p>Higher = more bang per person-month.</p>
        ),
      },
    ],
    showCharts: true,
    showEffortScoreFilters: true,
  },

  ICE: {
    framework: "ICE",
    displayName: "ICE",
    formula: "Impact × Confidence × Ease",
    intro:
      "Score items on Impact × Confidence × Ease (each 1–10) to spot the easy wins.",
    inputs: ICE_INPUTS,
    scoreFn(inputs) {
      const i = num(inputs.impact);
      const c = num(inputs.confidence);
      const e = num(inputs.ease);
      if (i === null || c === null || e === null) return null;
      return Math.round(i * c * e * 100) / 100;
    },
    metrics: [
      {
        term: "Impact",
        def: "1 – 10",
        detail: <p>How big the upside is if the bet pays off.</p>,
      },
      {
        term: "Confidence",
        def: "1 – 10",
        detail: <p>How sure are you that this will work?</p>,
      },
      {
        term: "Ease",
        def: "1 – 10",
        detail: <p>How easy is it to ship - higher = less effort.</p>,
      },
      {
        term: "Score",
        def: "I × C × E",
        detail: <p>Higher = better bet. Max 1000 (10 × 10 × 10).</p>,
      },
    ],
    showCharts: false,
    showEffortScoreFilters: false,
  },

  ValueEffort: {
    framework: "ValueEffort",
    displayName: "Value × Effort",
    formula: "Value ÷ Effort",
    intro:
      "Score items on Value ÷ Effort to find the best ROI per unit of work.",
    inputs: VALUE_EFFORT_INPUTS,
    scoreFn(inputs) {
      const v = num(inputs.value);
      const e = num(inputs.effort);
      if (v === null || e === null) return null;
      if (e <= 0) return null;
      return Math.round((v / e) * 100) / 100;
    },
    metrics: [
      {
        term: "Value",
        def: "Business value (free scale)",
        detail: <p>Pick a unit (e.g. revenue $, points, user impact) and stay consistent.</p>,
      },
      {
        term: "Effort",
        def: "Person-months (> 0)",
        detail: <p>How long the work takes end-to-end.</p>,
      },
      {
        term: "Score",
        def: "Value ÷ Effort",
        detail: <p>Higher = more value per unit of effort.</p>,
      },
    ],
    showCharts: false,
    showEffortScoreFilters: false,
  },

  MoSCoW: {
    framework: "MoSCoW",
    displayName: "MoSCoW",
    formula: "Must / Should / Could / Won't",
    intro:
      "Sort items into Must / Should / Could / Won't to lock this cycle's scope.",
    inputs: [MOSCOW_BUCKETS],
    scoreFn(inputs) {
      const bucket = inputs.bucket;
      if (typeof bucket !== "string" || !(bucket in MOSCOW_RANKS)) return null;
      return MOSCOW_RANKS[bucket];
    },
    metrics: [
      {
        term: "Bucket",
        def: "Must / Should / Could / Won't",
        detail: (
          <>
            <p className="font-medium text-slate-900">Categorical priority.</p>
            <ul className="mt-2 space-y-1">
              <li><span className="font-mono">Must</span> - required this cycle</li>
              <li><span className="font-mono">Should</span> - important but not blocking</li>
              <li><span className="font-mono">Could</span> - nice-to-have</li>
              <li><span className="font-mono">Won&apos;t</span> - explicitly out of scope</li>
            </ul>
          </>
        ),
      },
    ],
    showCharts: false,
    showEffortScoreFilters: false,
  },
};
