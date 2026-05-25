"use client";

import { useEffect, useState } from "react";

import type { ItemHistoryEntry } from "@frameboard/shared";

import { fetchItemHistory } from "@/lib/api";

// RICE keys we surface as a one-line "Reach: 1000 → 5000" diff. Anything
// outside this set is rendered generically (used for ad-hoc future fields).
const RICE_KEYS = ["reach", "impact", "confidence", "effort", "score"] as const;

interface Props {
  itemId: string;
  // Bumped by the parent every time it saves an edit — invalidates the
  // cached history so the panel refetches the new row(s) immediately.
  refreshKey?: number;
}

export function ItemHistory({ itemId, refreshKey = 0 }: Props) {
  const [entries, setEntries] = useState<ItemHistoryEntry[] | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch only when the section is opened and on each save round-trip —
  // closed-state visits don't burn a request.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    fetchItemHistory(itemId)
      .then((list) => {
        if (!cancelled) setEntries(list);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [itemId, open, refreshKey]);

  const count = entries?.length ?? null;

  return (
    <div className="rounded-lg border border-slate-200">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        <span className="flex items-center gap-2">
          <span>History</span>
          {count !== null && count > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {count}
            </span>
          )}
        </span>
        <span aria-hidden className={`text-slate-400 transition ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>
      {open && (
        <div className="border-t border-slate-200 px-4 py-3">
          {error && (
            <p className="text-xs text-red-600">Couldn&apos;t load history: {error}</p>
          )}
          {!error && entries === null && (
            <p className="text-xs text-slate-500">Loading…</p>
          )}
          {!error && entries !== null && entries.length === 0 && (
            <p className="text-xs text-slate-500">
              No changes yet. Score the item or edit a field to start the log.
            </p>
          )}
          {!error && entries !== null && entries.length > 0 && (
            <ol className="space-y-2">
              {entries.map((entry) => (
                <HistoryEntry key={entry.id} entry={entry} />
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

function HistoryEntry({ entry }: { entry: ItemHistoryEntry }) {
  const when = formatRelative(entry.changedAt);
  const diffs = buildDiffs(entry);
  return (
    <li className="rounded-md bg-slate-50/60 px-3 py-2">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span className="font-medium uppercase tracking-wider">
          {entry.kind === "score" ? "Score" : "Fields"}
        </span>
        <time dateTime={entry.changedAt} title={new Date(entry.changedAt).toLocaleString()}>
          {when}
        </time>
      </div>
      <ul className="mt-1 space-y-0.5 text-sm">
        {diffs.map((d, i) => (
          <li key={i} className="text-slate-700">
            <span className="text-slate-500">{d.label}: </span>
            <span className="text-slate-400">{d.before}</span>
            <span className="mx-1 text-slate-400">→</span>
            <span className="font-medium text-slate-900">{d.after}</span>
          </li>
        ))}
      </ul>
    </li>
  );
}

interface Diff {
  label: string;
  before: string;
  after: string;
}

function buildDiffs(entry: ItemHistoryEntry): Diff[] {
  if (entry.kind === "score") {
    // First scoring: before is null. Cleared: after is null. Both surface
    // as a single line so the timeline stays compact for those cases.
    if (entry.before === null && entry.after !== null) {
      return [
        {
          label: "Scored",
          before: "—",
          after: `score ${formatNumber(entry.after.score)}`,
        },
      ];
    }
    if (entry.after === null && entry.before !== null) {
      return [
        {
          label: "Cleared",
          before: `score ${formatNumber(entry.before.score)}`,
          after: "—",
        },
      ];
    }
    if (entry.before !== null && entry.after !== null) {
      const out: Diff[] = [];
      for (const k of RICE_KEYS) {
        const b = entry.before[k];
        const a = entry.after[k];
        if (b !== a) {
          out.push({
            label: capitalize(k),
            before: formatNumber(b),
            after: formatNumber(a),
          });
        }
      }
      return out.length > 0 ? out : [{ label: "—", before: "(no change)", after: "" }];
    }
  }
  // "fields" kind — render each changed key as its own line.
  const before = entry.before ?? {};
  const after = entry.after ?? {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return Array.from(keys).map((k) => ({
    label: capitalize(k),
    before: formatValue((before as Record<string, unknown>)[k]),
    after: formatValue((after as Record<string, unknown>)[k]),
  }));
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatNumber(v: unknown): string {
  if (typeof v !== "number") return formatValue(v);
  // Integer reach/effort look better without trailing zeros; score stays
  // at two decimals for consistency with the table.
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.length === 0 ? "[]" : v.join(", ");
  return String(v);
}

// Rough relative-time formatter. Anything older than a week falls back to
// the locale date string so the panel doesn't grow brittle precision
// labels like "47 days ago".
function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.round((now - then) / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}
