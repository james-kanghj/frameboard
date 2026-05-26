// /apps/web/src/lib/csv-export.ts
//
// Client-side CSV builder for a workspace board. We deliberately keep
// this off the backend: the items array is already in memory on the
// page, and routing a download through a server endpoint would add a
// network hop and an auth round-trip for no benefit. Outputs a string
// the caller can blob-download.

import type { BacklogItem, Framework } from "@frameboard/shared";

import { FRAMEWORK_CONFIGS } from "./framework-config";

// RFC 4180-flavoured escape: any cell containing a delimiter, quote,
// or newline gets wrapped in double quotes, with internal quotes
// doubled. Leaves bare ASCII strings untouched so the file diffs
// cleanly in git/spreadsheet apps.
function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(cells: unknown[]): string {
  return cells.map(escapeCell).join(",");
}

// Resolve a single item's "score inputs" - which columns appear
// depends on the workspace's framework. Falls back to empty strings
// for items that haven't been scored yet.
function scoreCellsFor(item: BacklogItem, framework: Framework): {
  inputs: (number | string)[];
  score: number | string;
} {
  if (framework === "RICE") {
    const s = item.riceScore;
    if (!s) return { inputs: ["", "", "", ""], score: "" };
    return {
      inputs: [s.reach, s.impact, s.confidence, s.effort],
      score: s.score,
    };
  }
  const config = FRAMEWORK_CONFIGS[framework];
  const score = item.score;
  if (!score) {
    return {
      inputs: config.inputs.map(() => ""),
      score: "",
    };
  }
  return {
    inputs: config.inputs.map((inp) => {
      const v = score.inputs[inp.key];
      return v === undefined || v === null ? "" : (v as number | string);
    }),
    score: score.score,
  };
}

export function itemsToCSV(
  items: BacklogItem[],
  framework: Framework,
): string {
  const config = FRAMEWORK_CONFIGS[framework];
  const headers = [
    "#",
    "Title",
    "Description",
    "Tags",
    ...config.inputs.map((inp) => inp.label),
    "Score",
    "Completed at",
    "Created at",
  ];

  const lines = [row(headers)];
  items.forEach((item, idx) => {
    const { inputs, score } = scoreCellsFor(item, framework);
    lines.push(
      row([
        idx + 1,
        item.title,
        item.description ?? "",
        // Tags joined with `; ` so spreadsheet apps don't try to split
        // on a comma inside a quoted cell.
        (item.tags ?? []).join("; "),
        ...inputs,
        score,
        item.completedAt ?? "",
        item.createdAt,
      ]),
    );
  });
  // BOM so Excel on Windows opens UTF-8 cleanly.
  return "﻿" + lines.join("\n");
}

// Slugify the workspace name into something filename-safe - replaces
// runs of non-alphanumerics with hyphens, trims trailing hyphens, and
// lowercases. Empty fallback uses "workspace" so files don't end up
// named just "-2026-05-26.csv".
function slugify(name: string): string {
  const s = name
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return s || "workspace";
}

export function downloadCSV(
  workspaceName: string,
  csv: string,
): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const today = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugify(workspaceName)}-${today}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Release the blob URL on the next tick - Safari occasionally needs
  // the URL alive past the synchronous click() handler.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
