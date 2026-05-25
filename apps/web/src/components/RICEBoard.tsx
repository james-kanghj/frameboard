"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import { createPortal } from "react-dom";

import type { BacklogItem, RICEImpact } from "@frameboard/shared";

import { createItem, deleteItem, scoreRICE } from "@/lib/api";

import { EditItemModal } from "@/components/EditItemModal";
import { ImpactSelect } from "@/components/ImpactSelect";

interface Props {
  workspaceId: string;
  workspaceName: string;
  initialItems: BacklogItem[];
}

type ToastTone = "error" | "success";
interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}
type ToastPusher = (tone: ToastTone, message: string) => void;
type ItemsSetter = Dispatch<SetStateAction<BacklogItem[]>>;
type FilterStatus = "all" | "scored" | "unscored";
type ChartView = "bars" | "scatter";
type EffortBucket = "all" | "quick" | "medium" | "big";
type ScoreBucket = "all" | "high" | "medium" | "low";

// PM-friendly buckets. Thresholds chosen against the current dataset
// (range 0.5–20 person-months, score 20–3600) so each bucket holds a
// non-empty slice for typical roadmaps.
const EFFORT_BUCKETS: ReadonlyArray<{
  value: EffortBucket;
  label: string;
  test: (effort: number) => boolean;
}> = [
  { value: "all", label: "Any", test: () => true },
  { value: "quick", label: "Quick (≤3)", test: (e) => e <= 3 },
  { value: "medium", label: "Medium (4–7)", test: (e) => e > 3 && e <= 7 },
  { value: "big", label: "Big (≥8)", test: (e) => e >= 8 },
];

const SCORE_BUCKETS: ReadonlyArray<{
  value: ScoreBucket;
  label: string;
  test: (score: number) => boolean;
}> = [
  { value: "all", label: "Any", test: () => true },
  { value: "high", label: "High (>1000)", test: (s) => s > 1000 },
  { value: "medium", label: "Med (200–1000)", test: (s) => s >= 200 && s <= 1000 },
  { value: "low", label: "Low (<200)", test: (s) => s < 200 },
];

export function RICEBoard({ workspaceId, workspaceName, initialItems }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [items, setItems] = useState(initialItems);
  const [addOpen, setAddOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BacklogItem | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Resync local state when the server component refetches (router.refresh).
  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  // Filter + chart-view state synced to URL so refreshes and shared links
  // preserve the working context. Each setter writes via router.replace
  // with scroll:false so the page doesn't jump.
  const search = searchParams.get("q") ?? "";
  const statusParam = searchParams.get("status");
  const status: FilterStatus =
    statusParam === "scored" || statusParam === "unscored"
      ? statusParam
      : "all";
  const viewParam = searchParams.get("view");
  const view: ChartView = viewParam === "scatter" ? "scatter" : "bars";
  const effortParam = searchParams.get("effort");
  const effort: EffortBucket =
    effortParam === "quick" || effortParam === "medium" || effortParam === "big"
      ? effortParam
      : "all";
  const scoreParam = searchParams.get("score");
  const scoreBucket: ScoreBucket =
    scoreParam === "high" || scoreParam === "medium" || scoreParam === "low"
      ? scoreParam
      : "all";
  const tagFilter = searchParams.get("tag") ?? "all";

  const setQueryParam = useCallback(
    (key: string, value: string, defaultValue: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (!value || value === defaultValue) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      const qs = next.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [searchParams, router, pathname],
  );

  const clearFilters = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("q");
    next.delete("status");
    next.delete("effort");
    next.delete("score");
    next.delete("tag");
    const qs = next.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [searchParams, router, pathname]);

  // Derived view: re-sort by score so optimistic score updates re-rank rows
  // live, without waiting for a router.refresh round-trip. Mirrors the
  // server's board ordering: score DESC (nulls last), then created_at ASC.
  const sortedItems = useMemo(() => sortByScore(items), [items]);

  // All distinct tags present in the workspace — drives the tag chip
  // group in the filter bar. Sorted case-insensitively for stable order.
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) {
      for (const t of it.tags ?? []) set.add(t);
    }
    return Array.from(set).sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase()),
    );
  }, [items]);

  const filteredItems = useMemo(() => {
    let result = sortedItems;
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (it) =>
          it.title.toLowerCase().includes(q) ||
          (it.description?.toLowerCase().includes(q) ?? false) ||
          (it.tags ?? []).some((t) => t.toLowerCase().includes(q)),
      );
    }
    if (status === "scored") {
      result = result.filter((it) => it.riceScore !== null);
    } else if (status === "unscored") {
      result = result.filter((it) => it.riceScore === null);
    }
    // Effort / score buckets only apply to scored items — an unscored item
    // has no effort or score to bucket against.
    if (effort !== "all" || scoreBucket !== "all") {
      const effortTest = EFFORT_BUCKETS.find((b) => b.value === effort)!.test;
      const scoreTest = SCORE_BUCKETS.find((b) => b.value === scoreBucket)!.test;
      result = result.filter((it) => {
        if (!it.riceScore) return false;
        return effortTest(it.riceScore.effort) && scoreTest(it.riceScore.score);
      });
    }
    if (tagFilter !== "all") {
      result = result.filter((it) => (it.tags ?? []).includes(tagFilter));
    }
    return result;
  }, [sortedItems, search, status, effort, scoreBucket, tagFilter]);

  const filterActive =
    search.trim().length > 0 ||
    status !== "all" ||
    effort !== "all" ||
    scoreBucket !== "all" ||
    tagFilter !== "all";

  const pushToast: ToastPusher = (tone, message) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, tone, message }]);
    window.setTimeout(
      () => setToasts((t) => t.filter((x) => x.id !== id)),
      3500,
    );
  };

  return (
    <section className="mt-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">
            {workspaceName}
          </h1>
          <p className="text-sm text-slate-500">
            {filterActive
              ? `${filteredItems.length} of ${items.length} items`
              : `${items.length} ${items.length === 1 ? "item" : "items"}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Add item
        </button>
      </header>

      <div className="mt-8">
        {items.length === 0 ? (
          <EmptyState onAdd={() => setAddOpen(true)} />
        ) : (
          <div className="space-y-4">
            <FilterBar
              search={search}
              status={status}
              effort={effort}
              scoreBucket={scoreBucket}
              tagFilter={tagFilter}
              allTags={allTags}
              onSearchChange={(v) => setQueryParam("q", v, "")}
              onStatusChange={(v) => setQueryParam("status", v, "all")}
              onEffortChange={(v) => setQueryParam("effort", v, "all")}
              onScoreBucketChange={(v) => setQueryParam("score", v, "all")}
              onTagChange={(v) => setQueryParam("tag", v, "all")}
              onClear={clearFilters}
              filterActive={filterActive}
            />
            <ChartView
              items={filteredItems}
              view={view}
              onViewChange={(v) => setQueryParam("view", v, "bars")}
            />
            <MetricLegend />
            {filteredItems.length === 0 ? (
              <NoMatchesState onClear={clearFilters} />
            ) : (
              <BoardTable
                items={filteredItems}
                setItems={setItems}
                pushToast={pushToast}
                refresh={() => router.refresh()}
                onEditItem={setEditingItem}
              />
            )}
          </div>
        )}
      </div>

      {addOpen && (
        <AddItemModal
          workspaceId={workspaceId}
          onClose={() => setAddOpen(false)}
          onCreated={(item) => {
            setItems((curr) => [...curr, item]);
            setAddOpen(false);
            router.refresh();
          }}
          onError={(msg) => pushToast("error", msg)}
        />
      )}

      {editingItem && (
        <EditItemModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSaved={() => {
            pushToast("success", "Item updated");
            router.refresh();
          }}
          onError={(msg) => pushToast("error", msg)}
        />
      )}

      <ToastStack toasts={toasts} />
    </section>
  );
}

// ──────────────────────────────────────────────────────────────── Filter bar ──

// Search input + segmented status toggle. Both update URL state so the
// PM's working view (e.g. "show me only unscored matching 'auth'") can
// be shared as a link or survives a refresh.
function FilterBar({
  search,
  status,
  effort,
  scoreBucket,
  tagFilter,
  allTags,
  onSearchChange,
  onStatusChange,
  onEffortChange,
  onScoreBucketChange,
  onTagChange,
  onClear,
  filterActive,
}: {
  search: string;
  status: FilterStatus;
  effort: EffortBucket;
  scoreBucket: ScoreBucket;
  tagFilter: string;
  allTags: string[];
  onSearchChange: (value: string) => void;
  onStatusChange: (value: FilterStatus) => void;
  onEffortChange: (value: EffortBucket) => void;
  onScoreBucketChange: (value: ScoreBucket) => void;
  onTagChange: (value: string) => void;
  onClear: () => void;
  filterActive: boolean;
}) {
  const statusOptions: { value: FilterStatus; label: string }[] = [
    { value: "all", label: "All" },
    { value: "scored", label: "Scored" },
    { value: "unscored", label: "Unscored" },
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 sm:max-w-md">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <circle
                cx="7"
                cy="7"
                r="4.5"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M10.5 10.5L14 14"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <input
              type="search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search title or description…"
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              aria-label="Search items"
            />
          </div>
          <div
            role="group"
            aria-label="Filter by status"
            className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5"
          >
            {statusOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={status === opt.value}
                onClick={() => onStatusChange(opt.value)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                  status === opt.value
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        {filterActive && (
          <button
            type="button"
            onClick={onClear}
            className="self-start rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700 sm:self-auto"
          >
            Clear filters
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
        <ChipGroup
          label="Effort"
          ariaLabel="Filter by effort bucket"
          value={effort}
          onChange={onEffortChange}
          options={EFFORT_BUCKETS.map((b) => ({ value: b.value, label: b.label }))}
        />
        <ChipGroup
          label="Score"
          ariaLabel="Filter by score bucket"
          value={scoreBucket}
          onChange={onScoreBucketChange}
          options={SCORE_BUCKETS.map((b) => ({ value: b.value, label: b.label }))}
        />
        {allTags.length > 0 && (
          <ChipGroup
            label="Tag"
            ariaLabel="Filter by tag"
            value={tagFilter}
            onChange={onTagChange}
            options={[
              { value: "all", label: "Any" },
              ...allTags.map((t) => ({ value: t, label: t })),
            ]}
          />
        )}
      </div>
    </div>
  );
}

function ChipGroup<T extends string>({
  label,
  ariaLabel,
  value,
  options,
  onChange,
}: {
  label: string;
  ariaLabel: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (next: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={ariaLabel}>
      <span className="text-slate-500">{label}:</span>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={`rounded-full border px-2.5 py-0.5 font-medium transition ${
            value === opt.value
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────── No matches ──

function NoMatchesState({ onClear }: { onClear: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-12 text-center">
      <h2 className="text-lg font-semibold text-slate-900">No matches</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-slate-600">
        No items match the current filters. Try a different search term or
        change the status filter.
      </p>
      <button
        type="button"
        onClick={onClear}
        className="mt-6 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Clear filters
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────── Chart view ──

// Wraps the two visualizations under one card with a Bars/Scatter tab
// toggle. Both views share the (already filter-applied) items prop so
// filtering and charting stay in sync.
function ChartView({
  items,
  view,
  onViewChange,
}: {
  items: BacklogItem[];
  view: ChartView;
  onViewChange: (next: ChartView) => void;
}) {
  const scoredCount = items.filter((it) => it.riceScore !== null).length;
  if (scoredCount < 2) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {view === "bars" ? `Top ${Math.min(10, scoredCount)} by score` : "Effort × Score"}
        </h2>
        <div
          role="group"
          aria-label="Chart view"
          className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5"
        >
          <ChartTab
            label="Bars"
            active={view === "bars"}
            onClick={() => onViewChange("bars")}
          />
          <ChartTab
            label="Scatter"
            active={view === "scatter"}
            onClick={() => onViewChange("scatter")}
          />
        </div>
      </div>
      {view === "bars" ? <BarsView items={items} /> : <ScatterView items={items} />}
    </div>
  );
}

function ChartTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded px-2 py-1 text-xs font-medium transition ${
        active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
      }`}
    >
      {label}
    </button>
  );
}

// Top-N horizontal bars. Extracted from the previous ScoreDistribution.
function BarsView({ items }: { items: BacklogItem[] }) {
  const scored = items.filter((it) => it.riceScore !== null).slice(0, 10);
  const maxScore = scored[0]?.riceScore?.score ?? 0;
  if (maxScore <= 0) return null;

  return (
    <ol className="space-y-2">
      {scored.map((item, idx) => {
        const score = item.riceScore?.score ?? 0;
        // Floor at 2% so even very low scores show a visible sliver.
        const widthPct = Math.max(2, (score / maxScore) * 100);
          return (
            <li key={item.id} className="flex items-center gap-3 text-sm">
              <span className="w-5 shrink-0 text-right tabular-nums text-slate-400">
                {idx + 1}
              </span>
              <span
                className="w-32 shrink-0 truncate text-slate-700 sm:w-56"
                title={item.title}
              >
                {item.title}
              </span>
              <div
                className="relative h-6 flex-1 overflow-hidden rounded bg-slate-100"
                role="img"
                aria-label={`Score ${score.toFixed(2)} of ${maxScore.toFixed(2)} maximum`}
              >
                <div
                  className="h-full rounded bg-slate-900"
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              <span className="w-16 shrink-0 text-right font-semibold tabular-nums text-slate-900 sm:w-20">
                {score.toFixed(2)}
              </span>
            </li>
          );
        })}
    </ol>
  );
}

// PM's classic 2×2: Effort (X axis, low → high) vs Score (Y axis, low →
// high). Dashed median lines split the plot into Quick wins (top-left),
// Big bets (top-right), Fill-ins (bottom-left), Avoid (bottom-right).
// Pure SVG, native <title> tooltip on each dot — no chart library.
function ScatterView({ items }: { items: BacklogItem[] }) {
  const scored = items.filter((it) => it.riceScore !== null);
  if (scored.length < 2) return null;

  const efforts = scored.map((it) => it.riceScore!.effort);
  const scores = scored.map((it) => it.riceScore!.score);
  const minEffort = Math.min(...efforts);
  const maxEffort = Math.max(...efforts);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const median = (arr: number[]) => {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)] ?? 0;
  };
  const medEffort = median(efforts);
  const medScore = median(scores);

  const WIDTH = 640;
  const HEIGHT = 400;
  const PAD_L = 56;
  const PAD_R = 24;
  const PAD_T = 24;
  const PAD_B = 44;

  const xRange = maxEffort - minEffort || 1;
  const yRange = maxScore - minScore || 1;
  const x = (e: number) =>
    PAD_L + ((e - minEffort) / xRange) * (WIDTH - PAD_L - PAD_R);
  const y = (s: number) =>
    HEIGHT - PAD_B - ((s - minScore) / yRange) * (HEIGHT - PAD_T - PAD_B);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-auto w-full"
      role="img"
      aria-label="Effort versus Score scatter plot"
    >
      {/* Plot area border */}
      <rect
        x={PAD_L}
        y={PAD_T}
        width={WIDTH - PAD_L - PAD_R}
        height={HEIGHT - PAD_T - PAD_B}
        fill="none"
        stroke="rgb(226 232 240)"
        strokeWidth="1"
      />

      {/* Median lines — split into quadrants */}
      <line
        x1={x(medEffort)}
        y1={PAD_T}
        x2={x(medEffort)}
        y2={HEIGHT - PAD_B}
        stroke="rgb(203 213 225)"
        strokeWidth="1"
        strokeDasharray="4 4"
      />
      <line
        x1={PAD_L}
        y1={y(medScore)}
        x2={WIDTH - PAD_R}
        y2={y(medScore)}
        stroke="rgb(203 213 225)"
        strokeWidth="1"
        strokeDasharray="4 4"
      />

      {/* Quadrant labels */}
      <text
        x={PAD_L + 8}
        y={PAD_T + 16}
        fontSize="11"
        fill="rgb(100 116 139)"
        className="select-none"
      >
        Quick wins
      </text>
      <text
        x={WIDTH - PAD_R - 8}
        y={PAD_T + 16}
        textAnchor="end"
        fontSize="11"
        fill="rgb(100 116 139)"
        className="select-none"
      >
        Big bets
      </text>
      <text
        x={PAD_L + 8}
        y={HEIGHT - PAD_B - 6}
        fontSize="11"
        fill="rgb(100 116 139)"
        className="select-none"
      >
        Fill-ins
      </text>
      <text
        x={WIDTH - PAD_R - 8}
        y={HEIGHT - PAD_B - 6}
        textAnchor="end"
        fontSize="11"
        fill="rgb(100 116 139)"
        className="select-none"
      >
        Avoid
      </text>

      {/* Axis labels */}
      <text
        x={(WIDTH + PAD_L - PAD_R) / 2}
        y={HEIGHT - 12}
        textAnchor="middle"
        fontSize="11"
        fill="rgb(71 85 105)"
        className="select-none"
      >
        Effort (person-months) →
      </text>
      <text
        x={16}
        y={(HEIGHT + PAD_T - PAD_B) / 2}
        fontSize="11"
        fill="rgb(71 85 105)"
        textAnchor="middle"
        transform={`rotate(-90 16 ${(HEIGHT + PAD_T - PAD_B) / 2})`}
        className="select-none"
      >
        Score →
      </text>

      {/* Axis tick marks (min/max) */}
      <text
        x={PAD_L}
        y={HEIGHT - PAD_B + 16}
        textAnchor="middle"
        fontSize="10"
        fill="rgb(148 163 184)"
      >
        {minEffort}
      </text>
      <text
        x={WIDTH - PAD_R}
        y={HEIGHT - PAD_B + 16}
        textAnchor="middle"
        fontSize="10"
        fill="rgb(148 163 184)"
      >
        {maxEffort}
      </text>
      <text
        x={PAD_L - 8}
        y={HEIGHT - PAD_B + 4}
        textAnchor="end"
        fontSize="10"
        fill="rgb(148 163 184)"
      >
        {minScore.toFixed(0)}
      </text>
      <text
        x={PAD_L - 8}
        y={PAD_T + 10}
        textAnchor="end"
        fontSize="10"
        fill="rgb(148 163 184)"
      >
        {maxScore.toFixed(0)}
      </text>

      {/* Dots */}
      {scored.map((item) => {
        const rs = item.riceScore!;
        return (
          <circle
            key={item.id}
            cx={x(rs.effort)}
            cy={y(rs.score)}
            r="5"
            fill="rgb(15 23 42)"
            fillOpacity="0.7"
            stroke="white"
            strokeWidth="1.5"
          >
            <title>
              {item.title}
              {"\n"}Effort: {rs.effort} · Score: {rs.score.toFixed(2)}
            </title>
          </circle>
        );
      })}
    </svg>
  );
}

// ───────────────────────────────────────────────────────────── Metric legend ──

// Compact key shown above the table so newcomers know what each column
// means without hunting for docs. Each entry has an (i) button — hover,
// focus, or tap to open a richer explanation (e.g. what the 0.25/0.5/1
// Impact values actually mean). Tooltip is portal'd so it can't be
// clipped by overflow containers or stacking contexts.
function MetricLegend() {
  const entries: {
    term: string;
    def: string;
    detail: React.ReactNode;
  }[] = [
    {
      term: "Reach",
      def: "People affected per period",
      detail: (
        <>
          <p className="font-medium text-slate-900">How many users (or events) are touched per time period.</p>
          <p className="mt-2">Pick a unit and use it consistently across the workspace — <em>per quarter</em> is the standard PM default.</p>
          <p className="mt-2 text-slate-500">Example: <span className="font-mono">5000</span> = 5,000 users / quarter.</p>
        </>
      ),
    },
    {
      term: "Impact",
      def: "0.25 (min) → 3 (massive)",
      detail: (
        <>
          <p className="font-medium text-slate-900">How much each affected user benefits. RICE uses a fixed five-point scale:</p>
          <ul className="mt-2 space-y-1">
            <li><span className="font-mono">0.25</span> — minimal (barely noticed)</li>
            <li><span className="font-mono">0.5</span> — low (small lift)</li>
            <li><span className="font-mono">1</span> — medium (noticeable)</li>
            <li><span className="font-mono">2</span> — high (clear win)</li>
            <li><span className="font-mono">3</span> — massive (transformative)</li>
          </ul>
        </>
      ),
    },
    {
      term: "Confidence",
      def: "0.0 – 1.0 belief",
      detail: (
        <>
          <p className="font-medium text-slate-900">Your confidence in the other three numbers (0–1).</p>
          <ul className="mt-2 space-y-1">
            <li><span className="font-mono">1.0</span> — backed by data / experiment</li>
            <li><span className="font-mono">~0.8</span> — strong gut feel</li>
            <li><span className="font-mono">~0.5</span> — best guess, very unsure</li>
          </ul>
          <p className="mt-2 text-slate-500">Acts as a hedge — the score is multiplied by this, so low confidence pulls big-sounding items back down.</p>
        </>
      ),
    },
    {
      term: "Effort",
      def: "Person-months (> 0)",
      detail: (
        <>
          <p className="font-medium text-slate-900">How long one team member would take to ship this end-to-end, in person-months.</p>
          <p className="mt-2">Include design, development, QA, and rollout — not just dev time.</p>
          <p className="mt-2 text-slate-500">Example: <span className="font-mono">2</span> = roughly 2 engineer-months (or 1 designer + 1 engineer for a month).</p>
        </>
      ),
    },
    {
      term: "Score",
      def: "(Reach × Impact × Confidence) / Effort",
      detail: (
        <>
          <p className="font-medium text-slate-900">The final RICE score — higher = more bang per person-month.</p>
          <p className="mt-2 font-mono text-slate-700">score = (R × I × C) ÷ E</p>
          <p className="mt-2 text-slate-500">Recomputes the moment you edit any of the four inputs. Sort the board by this column (descending) to see what to ship first.</p>
        </>
      ),
    },
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-5 gap-y-3 rounded-xl border border-slate-200 bg-slate-50/50 px-5 py-4 text-xs sm:grid-cols-3 lg:grid-cols-5">
      {entries.map(({ term, def, detail }) => (
        <div key={term} className="space-y-0.5">
          <dt className="flex items-center gap-1.5 font-semibold uppercase tracking-wider text-slate-500">
            <span>{term}</span>
            <InfoTooltip label={`${term} — more info`}>{detail}</InfoTooltip>
          </dt>
          <dd className="text-slate-600">{def}</dd>
        </div>
      ))}
    </dl>
  );
}

// Small (i) button with a portal'd tooltip that opens on hover, focus,
// or tap. Portal escapes overflow/stacking-context clipping the way
// RowMenu does; closes on outside click, Escape, scroll, or resize.
function InfoTooltip({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<
    { top: number; left: number } | null
  >(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  const recompute = useCallback(() => {
    if (!buttonRef.current) return;
    const btn = buttonRef.current.getBoundingClientRect();
    // Tooltip width is fixed via the className below; clamp position so
    // it can't overflow the viewport on either edge (was happening for
    // the leftmost metric "Reach" — half the bubble fell off-screen).
    const TIP_WIDTH = 288; // matches w-72
    const MARGIN = 8;
    const center = btn.left + btn.width / 2 - TIP_WIDTH / 2;
    const maxLeft = window.innerWidth - TIP_WIDTH - MARGIN;
    const left = Math.max(MARGIN, Math.min(center, maxLeft));
    setPosition({ top: btn.bottom + 6, left });
  }, []);

  useLayoutEffect(() => {
    if (open) recompute();
  }, [open, recompute]);

  useEffect(() => {
    if (!open) return;
    function onClickAway(e: MouseEvent) {
      if (
        buttonRef.current?.contains(e.target as Node) ||
        tipRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onReposition() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    return () => {
      document.removeEventListener("mousedown", onClickAway);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[9px] font-bold leading-none text-slate-500 transition hover:border-slate-500 hover:text-slate-700 focus:border-slate-500 focus:text-slate-700 focus:outline-none"
      >
        i
      </button>
      {open &&
        position &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={tipRef}
            role="tooltip"
            style={{
              position: "fixed",
              top: position.top,
              left: position.left,
            }}
            // Fixed w-72 (288px) so layout matches the position math
            // above; max-w cap so very narrow viewports (mobile) shrink
            // it instead of overflowing.
            className="z-50 w-72 max-w-[calc(100vw-16px)] rounded-lg border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-700 shadow-lg"
            // Keep tooltip open while the cursor is inside it.
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}

// ────────────────────────────────────────────────────────────── Empty state ──

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-12 text-center">
      <h2 className="text-lg font-semibold text-slate-900">No items yet</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-slate-600">
        Items are the things you want to score. Add a few, then grade them on
        Reach × Impact × Confidence ÷ Effort.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-6 inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
      >
        Add your first item
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────── Table ──

interface TableProps {
  items: BacklogItem[];
  setItems: ItemsSetter;
  pushToast: ToastPusher;
  refresh: () => void;
  onEditItem: (item: BacklogItem) => void;
}

function BoardTable({
  items,
  setItems,
  pushToast,
  refresh,
  onEditItem,
}: TableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wider text-slate-500">
          <tr>
            <th className="w-12 px-3 py-3 text-left">#</th>
            <th className="px-3 py-3 text-left">Title</th>
            <th className="w-28 px-3 py-3 text-right">Reach</th>
            <th className="w-36 px-3 py-3 text-left">Impact</th>
            <th className="w-32 px-3 py-3 text-right">Confidence</th>
            <th className="w-24 px-3 py-3 text-right">Effort</th>
            <th className="w-28 px-3 py-3 text-right">Score</th>
            <th className="w-12 px-3 py-3" aria-label="Actions" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {items.map((item, idx) => (
            <BoardRow
              key={item.id}
              item={item}
              rank={idx + 1}
              setItems={setItems}
              pushToast={pushToast}
              refresh={refresh}
              onEditItem={onEditItem}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────── Row ──

interface RowProps {
  item: BacklogItem;
  rank: number;
  setItems: ItemsSetter;
  pushToast: ToastPusher;
  refresh: () => void;
  onEditItem: (item: BacklogItem) => void;
}

function BoardRow({
  item,
  rank,
  setItems,
  pushToast,
  refresh,
  onEditItem,
}: RowProps) {
  const rs = item.riceScore;
  const [scoringOpen, setScoringOpen] = useState(false);

  async function persistScore(next: {
    reach: number;
    impact: RICEImpact;
    confidence: number;
    effort: number;
  }) {
    const previous = rs;
    const optimisticScore = computeScore(
      next.reach,
      next.impact,
      next.confidence,
      next.effort,
    );
    setItems((curr) =>
      curr.map((it) =>
        it.id === item.id
          ? {
              ...it,
              riceScore: {
                reach: next.reach,
                impact: next.impact,
                confidence: next.confidence,
                effort: next.effort,
                score: optimisticScore,
                updatedAt: new Date().toISOString(),
              },
            }
          : it,
      ),
    );

    try {
      const result = await scoreRICE({
        itemId: item.id,
        reach: next.reach,
        impact: next.impact,
        confidence: next.confidence,
        effort: next.effort,
      });
      // Reconcile with the server's authoritative rounded score.
      setItems((curr) =>
        curr.map((it) =>
          it.id === item.id && it.riceScore
            ? { ...it, riceScore: { ...it.riceScore, score: result.score } }
            : it,
        ),
      );
    } catch (err) {
      setItems((curr) =>
        curr.map((it) =>
          it.id === item.id ? { ...it, riceScore: previous } : it,
        ),
      );
      pushToast(
        "error",
        err instanceof Error ? err.message : "Failed to save score",
      );
    }
  }

  async function updateOneField(
    field: "reach" | "confidence" | "effort" | "impact",
    value: number,
  ) {
    if (!rs) return;
    await persistScore({
      reach: field === "reach" ? value : rs.reach,
      impact:
        field === "impact" ? (value as RICEImpact) : (rs.impact as RICEImpact),
      confidence: field === "confidence" ? value : rs.confidence,
      effort: field === "effort" ? value : rs.effort,
    });
  }

  async function handleDelete() {
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete "${item.title}"? This can't be undone.`)
    ) {
      return;
    }
    const snapshot = item;
    setItems((curr) => curr.filter((it) => it.id !== item.id));
    try {
      await deleteItem(item.id);
      refresh();
    } catch (err) {
      // Re-insert; sort will fix up rank on the next server refresh.
      setItems((curr) => [...curr, snapshot]);
      pushToast(
        "error",
        err instanceof Error ? err.message : "Failed to delete item",
      );
    }
  }

  return (
    <tr className="hover:bg-slate-50/60">
      <td className="px-3 py-3 text-slate-400">{rank}</td>
      <td className="px-3 py-3">
        <div className="font-medium text-slate-900">{item.title}</div>
        {item.description && (
          <div className="mt-0.5 text-xs text-slate-500 line-clamp-1">
            {item.description}
          </div>
        )}
        {(item.tags ?? []).length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {(item.tags ?? []).slice(0, 3).map((tag, idx) => (
              <span
                key={`${tag}-${idx}`}
                className="inline-block rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
              >
                {tag}
              </span>
            ))}
            {(item.tags ?? []).length > 3 && (
              <span className="text-[10px] text-slate-400">
                +{(item.tags ?? []).length - 3}
              </span>
            )}
          </div>
        )}
      </td>

      {scoringOpen && !rs ? (
        <ScoringFormCells
          onCancel={() => setScoringOpen(false)}
          onSave={async (vals) => {
            await persistScore(vals);
            setScoringOpen(false);
          }}
        />
      ) : rs ? (
        <ScoredCells
          reach={rs.reach}
          impact={rs.impact}
          confidence={rs.confidence}
          effort={rs.effort}
          score={rs.score}
          onChangeField={updateOneField}
        />
      ) : (
        <UnscoredCells onStartScoring={() => setScoringOpen(true)} />
      )}

      <RowMenu onDelete={handleDelete} onEdit={() => onEditItem(item)} />
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────── Cells ──

function ScoredCells({
  reach,
  impact,
  confidence,
  effort,
  score,
  onChangeField,
}: {
  reach: number;
  impact: number;
  confidence: number;
  effort: number;
  score: number;
  onChangeField: (
    field: "reach" | "confidence" | "effort" | "impact",
    value: number,
  ) => void | Promise<void>;
}) {
  return (
    <>
      <EditableNumberCell
        value={reach}
        min={0}
        step={1}
        onSave={(v) => onChangeField("reach", v)}
      />
      <td className="px-3 py-2">
        <ImpactSelect
          value={impact}
          onChange={(v) => onChangeField("impact", v)}
        />
      </td>
      <EditableNumberCell
        value={confidence}
        min={0}
        max={1}
        step={0.1}
        onSave={(v) => onChangeField("confidence", v)}
      />
      <EditableNumberCell
        value={effort}
        min={0.01}
        step={0.1}
        onSave={(v) => onChangeField("effort", v)}
      />
      <td className="bg-slate-50/70 px-3 py-3 text-right font-semibold text-slate-900">
        {score.toFixed(2)}
      </td>
    </>
  );
}

function UnscoredCells({ onStartScoring }: { onStartScoring: () => void }) {
  return (
    <>
      <td className="px-3 py-3 text-right text-slate-300">—</td>
      <td className="px-3 py-3 text-slate-300">—</td>
      <td className="px-3 py-3 text-right text-slate-300">—</td>
      <td className="px-3 py-3 text-right text-slate-300">—</td>
      <td className="bg-slate-50/70 px-3 py-2 text-right">
        <button
          type="button"
          onClick={onStartScoring}
          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
        >
          Score
        </button>
      </td>
    </>
  );
}

function ScoringFormCells({
  onSave,
  onCancel,
}: {
  onSave: (vals: {
    reach: number;
    impact: RICEImpact;
    confidence: number;
    effort: number;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [reach, setReach] = useState("");
  const [impact, setImpact] = useState<RICEImpact>(1);
  const [confidence, setConfidence] = useState("");
  const [effort, setEffort] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reachNum = Number(reach);
  const confidenceNum = Number(confidence);
  const effortNum = Number(effort);
  const valid =
    reach !== "" &&
    Number.isFinite(reachNum) &&
    reachNum >= 0 &&
    confidence !== "" &&
    Number.isFinite(confidenceNum) &&
    confidenceNum >= 0 &&
    confidenceNum <= 1 &&
    effort !== "" &&
    Number.isFinite(effortNum) &&
    effortNum > 0;

  async function handleSave() {
    if (!valid || submitting) return;
    setSubmitting(true);
    try {
      await onSave({
        reach: reachNum,
        impact,
        confidence: confidenceNum,
        effort: effortNum,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <td className="px-3 py-2 text-right">
        <input
          type="number"
          min={0}
          step={1}
          autoFocus
          value={reach}
          onChange={(e) => setReach(e.target.value)}
          placeholder="1000"
          className={inlineInputClasses}
        />
      </td>
      <td className="px-3 py-2">
        <ImpactSelect value={impact} onChange={setImpact} />
      </td>
      <td className="px-3 py-2 text-right">
        <input
          type="number"
          min={0}
          max={1}
          step={0.1}
          value={confidence}
          onChange={(e) => setConfidence(e.target.value)}
          placeholder="0.8"
          className={inlineInputClasses}
        />
      </td>
      <td className="px-3 py-2 text-right">
        <input
          type="number"
          min={0.01}
          step={0.1}
          value={effort}
          onChange={(e) => setEffort(e.target.value)}
          placeholder="2"
          className={inlineInputClasses}
        />
      </td>
      <td className="bg-slate-50/70 px-3 py-2 text-right">
        <div className="flex justify-end gap-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!valid || submitting}
            className="rounded bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-40"
          >
            {submitting ? "…" : "Save"}
          </button>
        </div>
      </td>
    </>
  );
}

function EditableNumberCell({
  value,
  min,
  max,
  step,
  onSave,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onSave: (newValue: number) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  function startEdit() {
    setDraft(String(value));
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    const next = Number(draft);
    if (!Number.isFinite(next) || next === value) return;
    void onSave(next);
  }

  if (editing) {
    return (
      <td className="px-3 py-2 text-right">
        <input
          type="number"
          autoFocus
          value={draft}
          min={min}
          max={max}
          step={step}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.currentTarget as HTMLInputElement).blur();
            } else if (e.key === "Escape") {
              setEditing(false);
            }
          }}
          className={inlineInputClasses}
        />
      </td>
    );
  }

  return (
    <td
      role="button"
      tabIndex={0}
      onClick={startEdit}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          startEdit();
        }
      }}
      className="cursor-pointer px-3 py-3 text-right text-slate-900 hover:bg-slate-100/70 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-slate-400"
    >
      {value}
    </td>
  );
}

// Explicit widths instead of `w-full`. With the number-input spinner buttons
// (~16-20 px) plus px-2 padding, the previous `w-full` inside a w-28 cell
// only left room for ~5 digits before the value scrolled inside the input.
// w-20 on mobile / w-24 on sm+ gives every numeric input enough room for
// the realistic value ranges (Reach ≤ 999,999; Confidence 0.0-1.0;
// Effort up to a few hundred) without internal scroll, and inputs stay
// uniformly sized across columns regardless of cell width.
const inlineInputClasses =
  "w-20 sm:w-24 rounded border border-slate-300 bg-white px-2 py-1 text-right text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";

// ──────────────────────────────────────────────────────────────── Row menu ──

// The menu is rendered into document.body via a portal because the table is
// wrapped in `overflow-x-auto`, which implicitly clips on the cross-axis and
// would crop an in-tree absolutely-positioned dropdown. Fixed positioning
// from the button's bounding rect lets it float above the table without
// fighting the wrapper's overflow behavior.
const MENU_WIDTH = 160; // matches w-40 used below
const MENU_HEIGHT_ESTIMATE = 80; // Edit + Delete rows + py-1; only used for the flip decision
const MENU_GAP = 4;

function RowMenu({
  onDelete,
  onEdit,
}: {
  onDelete: () => void;
  onEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < MENU_HEIGHT_ESTIMATE + MENU_GAP;
    setPosition({
      top: openUpward
        ? rect.top - MENU_HEIGHT_ESTIMATE - MENU_GAP
        : rect.bottom + MENU_GAP,
      left: rect.right - MENU_WIDTH,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onClickAway(e: MouseEvent) {
      if (
        buttonRef.current?.contains(e.target as Node) ||
        menuRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    // Close on scroll/resize rather than tracking — simpler and matches
    // common dropdown UX.
    function onReposition() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    return () => {
      document.removeEventListener("mousedown", onClickAway);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
    };
  }, [open]);

  return (
    <td className="px-3 py-2 text-right">
      <button
        ref={buttonRef}
        type="button"
        aria-label="Row actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      >
        ⋯
      </button>
      {open &&
        position &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: "fixed",
              top: position.top,
              left: position.left,
              width: MENU_WIDTH,
            }}
            className="z-50 rounded-lg border border-slate-200 bg-white py-1 text-left shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onEdit();
              }}
              className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              Edit
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
              className="block w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          </div>,
          document.body,
        )}
    </td>
  );
}

// ─────────────────────────────────────────────────────────── Add item modal ──

function AddItemModal({
  workspaceId,
  onClose,
  onCreated,
  onError,
}: {
  workspaceId: string;
  onClose: () => void;
  onCreated: (item: BacklogItem) => void;
  onError: (msg: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      const item = await createItem(workspaceId, {
        title: trimmed,
        description: description.trim() || null,
      });
      onCreated(item);
    } catch (err) {
      setSubmitting(false);
      onError(err instanceof Error ? err.message : "Failed to add item");
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-item-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="add-item-title" className="text-lg font-semibold">
          New item
        </h2>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label
              htmlFor="item-title"
              className="block text-sm font-medium text-slate-700"
            >
              Title
            </label>
            <input
              id="item-title"
              type="text"
              autoFocus
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={submitting}
              placeholder="Ship dark mode toggle"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:opacity-60"
            />
          </div>
          <div>
            <label
              htmlFor="item-description"
              className="block text-sm font-medium text-slate-700"
            >
              Description <span className="text-slate-400">(optional)</span>
            </label>
            <textarea
              id="item-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={submitting}
              placeholder="Short context for the team"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:opacity-60"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !title.trim()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
            >
              {submitting ? "Adding…" : "Add item"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────── Toasts ──

function ToastStack({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto rounded-lg border px-4 py-2 text-sm shadow-lg ${
            t.tone === "error"
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────── Helpers ──

function computeScore(
  reach: number,
  impact: number,
  confidence: number,
  effort: number,
): number {
  if (effort <= 0) return 0;
  return Math.round(((reach * impact * confidence) / effort) * 100) / 100;
}

// Mirrors the backend's list_board ordering: scored items by score DESC,
// unscored items at the bottom; ties broken by created_at ASC so rank is
// deterministic on the client between server-refresh boundaries.
function sortByScore(items: BacklogItem[]): BacklogItem[] {
  return [...items].sort((a, b) => {
    const aScore = a.riceScore?.score ?? null;
    const bScore = b.riceScore?.score ?? null;
    if (aScore !== null && bScore !== null) {
      if (bScore !== aScore) return bScore - aScore;
      return a.createdAt.localeCompare(b.createdAt);
    }
    if (aScore !== null) return -1;
    if (bScore !== null) return 1;
    return a.createdAt.localeCompare(b.createdAt);
  });
}
