"use client";

// Board variant for non-RICE workspaces (ICE / MoSCoW / ValueEffort).
// RICEBoard stays untouched — its inline editing, charts, and effort/score
// bucket filters are RICE-shaped. This component renders a leaner table
// (title + tags + score + actions) plus a framework-aware scoring modal
// so the other three frameworks are usable without dragging RICE-only
// affordances into the UI.

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";

import type { BacklogItem, Framework, ScoreData } from "@frameboard/shared";

import {
  createItem,
  deleteItem,
  deleteScore,
  scoreItem,
  updateItem,
} from "@/lib/api";

import { ExportMenu } from "@/components/ExportMenu";
import { MembersMenu } from "@/components/MembersMenu";
import {
  FRAMEWORK_CONFIGS,
  type FrameworkConfig,
  type ScoreInputDef,
} from "@/lib/framework-config";
import { InfoTooltip } from "@/components/InfoTooltip";

interface Props {
  workspaceId: string;
  workspaceName: string;
  workspaceOwnerId: string;
  framework: Framework;
  initialItems: BacklogItem[];
}

type ToastTone = "error" | "success";
interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}
type FilterStatus = "all" | "scored" | "unscored";

export function PolymorphicBoard({
  workspaceId,
  workspaceName,
  workspaceOwnerId,
  framework,
  initialItems,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const config = FRAMEWORK_CONFIGS[framework];
  const [items, setItems] = useState(initialItems);
  const [addOpen, setAddOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BacklogItem | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  // URL-synced filter state. Mirrors RICEBoard's pattern so query params
  // (and shareable links) stay consistent across frameworks.
  const search = searchParams.get("q") ?? "";
  const statusParam = searchParams.get("status");
  const status: FilterStatus =
    statusParam === "scored" || statusParam === "unscored"
      ? statusParam
      : "all";
  const tagFilter = searchParams.get("tag") ?? "all";
  const showCompleted = searchParams.get("completed") === "show";

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
    next.delete("tag");
    next.delete("completed");
    const qs = next.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [searchParams, router, pathname]);

  // Sort: completed items sink to the bottom first; within each group,
  // scored items by score DESC, unscored by created_at ASC. Matches the
  // backend's list_board ordering for non-RICE frameworks.
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const aDone = a.completedAt ? 1 : 0;
      const bDone = b.completedAt ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      const aScore = a.score?.score ?? null;
      const bScore = b.score?.score ?? null;
      if (aScore !== null && bScore !== null) {
        if (bScore !== aScore) return bScore - aScore;
        return a.createdAt.localeCompare(b.createdAt);
      }
      if (aScore !== null) return -1;
      if (bScore !== null) return 1;
      return a.createdAt.localeCompare(b.createdAt);
    });
  }, [items]);

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
      result = result.filter((it) => it.score != null);
    } else if (status === "unscored") {
      result = result.filter((it) => it.score == null);
    }
    if (tagFilter !== "all") {
      result = result.filter((it) => (it.tags ?? []).includes(tagFilter));
    }
    if (!showCompleted) {
      result = result.filter((it) => !it.completedAt);
    }
    return result;
  }, [sortedItems, search, status, tagFilter, showCompleted]);

  const filterActive =
    search.trim().length > 0 ||
    status !== "all" ||
    tagFilter !== "all" ||
    showCompleted;

  const pushToast = (tone: ToastTone, message: string) => {
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
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">
              {workspaceName}
            </h1>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-600">
              {config.displayName}
            </span>
          </div>
          <p className="text-sm text-slate-500">
            {filterActive
              ? `${filteredItems.length} of ${items.length} items`
              : `${items.length} ${items.length === 1 ? "item" : "items"}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MembersMenu
            workspaceId={workspaceId}
            workspaceOwnerId={workspaceOwnerId}
          />
          <ExportMenu
            workspaceId={workspaceId}
            workspaceName={workspaceName}
            framework={framework}
            items={items}
          />
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Add item
          </button>
        </div>
      </header>

      <div className="mt-8">
        {items.length === 0 ? (
          <EmptyState onAdd={() => setAddOpen(true)} formula={config.formula} />
        ) : (
          <div className="space-y-4">
            <FilterBar
              search={search}
              status={status}
              tagFilter={tagFilter}
              allTags={allTags}
              showCompleted={showCompleted}
              onSearchChange={(v) => setQueryParam("q", v, "")}
              onStatusChange={(v) => setQueryParam("status", v, "all")}
              onTagChange={(v) => setQueryParam("tag", v, "all")}
              onShowCompletedChange={(v) =>
                setQueryParam("completed", v ? "show" : "", "")
              }
              onClear={clearFilters}
              filterActive={filterActive}
            />
            <MetricLegend config={config} />
            {filteredItems.length === 0 ? (
              <NoMatchesState onClear={clearFilters} />
            ) : (
              <BoardTable
                items={filteredItems}
                config={config}
                setItems={setItems}
                onEditItem={setEditingItem}
                pushToast={pushToast}
                refresh={() => router.refresh()}
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
          config={config}
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

// ───────────────────────────────────────────────── FilterBar (lean) ──

function FilterBar({
  search,
  status,
  tagFilter,
  allTags,
  showCompleted,
  onSearchChange,
  onStatusChange,
  onTagChange,
  onShowCompletedChange,
  onClear,
  filterActive,
}: {
  search: string;
  status: FilterStatus;
  tagFilter: string;
  allTags: string[];
  showCompleted: boolean;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: FilterStatus) => void;
  onTagChange: (value: string) => void;
  onShowCompletedChange: (next: boolean) => void;
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
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search title or description…"
            className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 sm:max-w-md"
          />
          <div
            role="group"
            aria-label="Filter by status"
            className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5"
          >
            {statusOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onStatusChange(opt.value)}
                aria-pressed={status === opt.value}
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
      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-500">Tag:</span>
          <button
            type="button"
            onClick={() => onTagChange("all")}
            aria-pressed={tagFilter === "all"}
            className={`rounded-full border px-2.5 py-0.5 font-medium transition ${
              tagFilter === "all"
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
            }`}
          >
            Any
          </button>
          {allTags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onTagChange(t)}
              aria-pressed={tagFilter === t}
              className={`rounded-full border px-2.5 py-0.5 font-medium transition ${
                tagFilter === t
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}
      <div className="text-xs">
        <label className="inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900">
          <input
            type="checkbox"
            checked={showCompleted}
            onChange={(e) => onShowCompletedChange(e.target.checked)}
            className="h-3.5 w-3.5 cursor-pointer rounded border-slate-300 text-slate-900 focus:ring-1 focus:ring-slate-500"
          />
          Show completed
        </label>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────── MetricLegend ──

function MetricLegend({ config }: { config: FrameworkConfig }) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-600">{config.intro}</p>
      <dl className="grid grid-cols-2 gap-x-5 gap-y-3 rounded-xl border border-slate-200 bg-slate-50/50 px-5 py-4 text-xs sm:grid-cols-3 lg:grid-cols-4">
        {config.metrics.map(({ term, def, detail }) => (
          <div key={term} className="space-y-0.5">
            <dt className="flex items-center gap-1.5 font-semibold uppercase tracking-wider text-slate-500">
              <span>{term}</span>
              <InfoTooltip label={`${term} — more info`}>{detail}</InfoTooltip>
            </dt>
            <dd className="text-slate-600">{def}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ───────────────────────────────────────────────────── empty / nomatch ──

function EmptyState({
  onAdd,
  formula,
}: {
  onAdd: () => void;
  formula: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-12 text-center">
      <h2 className="text-lg font-semibold text-slate-900">No items yet</h2>
      {/* max-w-xl + whitespace-nowrap on the formula span: the mono text
          for MoSCoW ("Must / Should / Could / Won't") is wide enough
          that max-w-sm forced an awkward break in the middle of the
          slash-separated list. Keep the formula as one atomic chunk
          and give the paragraph room to fit it. */}
      <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">
        Add items to score with{" "}
        <span className="whitespace-nowrap font-mono text-slate-700">
          {formula}
        </span>
        .
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

function NoMatchesState({ onClear }: { onClear: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-12 text-center">
      <h2 className="text-lg font-semibold text-slate-900">No matches</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-slate-600">
        No items match the current filters.
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

// ─────────────────────────────────────────────────────────── Table ──

type ItemsSetter = Dispatch<SetStateAction<BacklogItem[]>>;
type ToastPusher = (tone: ToastTone, message: string) => void;

function BoardTable({
  items,
  config,
  setItems,
  onEditItem,
  pushToast,
  refresh,
}: {
  items: BacklogItem[];
  config: FrameworkConfig;
  setItems: ItemsSetter;
  onEditItem: (item: BacklogItem) => void;
  pushToast: ToastPusher;
  refresh: () => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wider text-slate-500">
          <tr>
            <th className="w-10 px-3 py-3" aria-label="Done" />
            <th className="w-12 px-3 py-3 text-left">#</th>
            <th className="px-3 py-3 text-left">Title</th>
            {config.inputs.map((inp) => (
              <th key={inp.key} className="w-32 px-3 py-3 text-right">
                {inp.label}
              </th>
            ))}
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
              config={config}
              setItems={setItems}
              onEditItem={onEditItem}
              pushToast={pushToast}
              refresh={refresh}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BoardRow({
  item,
  rank,
  config,
  setItems,
  onEditItem,
  pushToast,
  refresh,
}: {
  item: BacklogItem;
  rank: number;
  config: FrameworkConfig;
  setItems: ItemsSetter;
  onEditItem: (item: BacklogItem) => void;
  pushToast: ToastPusher;
  refresh: () => void;
}) {
  const score = item.score ?? null;

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
      setItems((curr) => [...curr, snapshot]);
      pushToast(
        "error",
        err instanceof Error ? err.message : "Failed to delete item",
      );
    }
  }

  async function toggleCompleted() {
    const previous = item.completedAt;
    const next = previous ? null : new Date().toISOString();
    setItems((curr) =>
      curr.map((it) =>
        it.id === item.id ? { ...it, completedAt: next } : it,
      ),
    );
    try {
      await updateItem(item.id, { completedAt: next });
    } catch (err) {
      setItems((curr) =>
        curr.map((it) =>
          it.id === item.id ? { ...it, completedAt: previous } : it,
        ),
      );
      pushToast(
        "error",
        err instanceof Error ? err.message : "Failed to update item",
      );
    }
  }

  const isDone = Boolean(item.completedAt);

  return (
    <tr
      className={`hover:bg-slate-50/60 ${
        isDone ? "bg-slate-50/40 text-slate-400" : ""
      }`}
    >
      <td className="px-3 py-3 text-center">
        <input
          type="checkbox"
          checked={isDone}
          onChange={toggleCompleted}
          aria-label={isDone ? "Mark as open" : "Mark as done"}
          className="h-4 w-4 cursor-pointer rounded border-slate-300 text-slate-900 focus:ring-1 focus:ring-slate-500"
        />
      </td>
      <td className="px-3 py-3 text-slate-400">{rank}</td>
      <td className="px-3 py-3">
        <div
          className={`font-medium ${isDone ? "text-slate-500 line-through" : "text-slate-900"}`}
        >
          {item.title}
        </div>
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
      {config.inputs.map((inp) => (
        <td key={inp.key} className="px-3 py-3 text-right text-slate-900">
          {renderInputCell(score, inp)}
        </td>
      ))}
      <td className="bg-slate-50/70 px-3 py-3 text-right font-semibold text-slate-900">
        {score ? score.score.toFixed(2) : (
          <button
            type="button"
            onClick={() => onEditItem(item)}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            Score
          </button>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        <button
          type="button"
          aria-label="Edit"
          onClick={() => onEditItem(item)}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          ✎
        </button>
        <button
          type="button"
          aria-label="Delete"
          onClick={handleDelete}
          className="ml-1 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
        >
          ×
        </button>
      </td>
    </tr>
  );
}

function renderInputCell(score: ScoreData | null, def: ScoreInputDef): string {
  if (!score) return "—";
  const v = score.inputs[def.key];
  if (v === undefined || v === null) return "—";
  if (typeof v === "number") {
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
  }
  return String(v);
}

// ───────────────────────────────────────────────── Add item modal ──

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">New item</h2>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="poly-new-title" className="block text-sm font-medium text-slate-700">
              Title
            </label>
            <input
              id="poly-new-title"
              type="text"
              autoFocus
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={submitting}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:opacity-60"
            />
          </div>
          <div>
            <label htmlFor="poly-new-desc" className="block text-sm font-medium text-slate-700">
              Description <span className="text-slate-400">(optional)</span>
            </label>
            <textarea
              id="poly-new-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={submitting}
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

// ───────────────────────────────────────────────── Edit + Score modal ──

function EditItemModal({
  item,
  config,
  onClose,
  onSaved,
  onError,
}: {
  item: BacklogItem;
  config: FrameworkConfig;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? "");
  // Initialise score inputs from the item's existing score, falling
  // back to empty strings so the modal renders cleanly for unscored
  // items.
  const initialInputs = useMemo<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const inp of config.inputs) {
      const existing = item.score?.inputs?.[inp.key];
      out[inp.key] = existing !== undefined && existing !== null
        ? String(existing)
        : "";
    }
    return out;
  }, [item.score, config.inputs]);
  const [inputs, setInputs] = useState<Record<string, string>>(initialInputs);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

  // The user "wants to score" iff at least one input is filled. A fully
  // empty form means "save title/description only". A partially-filled
  // form is treated as an error so the user notices.
  const filledCount = config.inputs.filter(
    (inp) => inputs[inp.key]?.trim() !== "",
  ).length;
  const allFilled = filledCount === config.inputs.length;
  const noneFilled = filledCount === 0;
  const partial = !allFilled && !noneFilled;

  const parsedInputs = useMemo<Record<string, unknown>>(() => {
    const out: Record<string, unknown> = {};
    for (const inp of config.inputs) {
      const raw = inputs[inp.key]?.trim() ?? "";
      if (raw === "") continue;
      if (inp.type === "bucket") {
        out[inp.key] = raw;
      } else {
        const n = Number(raw);
        if (Number.isFinite(n)) out[inp.key] = n;
      }
    }
    return out;
  }, [inputs, config.inputs]);

  const livePreview = allFilled ? config.scoreFn(parsedInputs) : null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (partial || submitting || !title.trim()) return;

    const newTitle = title.trim();
    const newDescription = description.trim() || null;
    const titleChanged = newTitle !== item.title;
    const descriptionChanged = newDescription !== item.description;

    const promises: Promise<unknown>[] = [];
    if (titleChanged || descriptionChanged) {
      promises.push(
        updateItem(item.id, {
          ...(titleChanged ? { title: newTitle } : {}),
          ...(descriptionChanged ? { description: newDescription } : {}),
        }),
      );
    }
    if (allFilled) {
      promises.push(
        scoreItem({
          itemId: item.id,
          framework: config.framework,
          inputs: parsedInputs,
        }),
      );
    } else if (noneFilled && item.score) {
      // All inputs cleared → clear the existing score.
      promises.push(deleteScore(item.id, config.framework));
    }

    if (promises.length === 0) {
      onClose();
      return;
    }

    setSubmitting(true);
    try {
      await Promise.all(promises);
      onSaved();
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to save item");
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Edit item</h2>
        <p className="mt-1 text-xs text-slate-500">
          {config.displayName} · <span className="font-mono">{config.formula}</span>
        </p>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="poly-edit-title" className="block text-sm font-medium text-slate-700">
              Title
            </label>
            <input
              id="poly-edit-title"
              type="text"
              autoFocus
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={submitting}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:opacity-60"
            />
          </div>
          <div>
            <label htmlFor="poly-edit-desc" className="block text-sm font-medium text-slate-700">
              Description <span className="text-slate-400">(optional)</span>
            </label>
            <textarea
              id="poly-edit-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={submitting}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:opacity-60"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {config.inputs.map((inp) => (
              <ScoreInputField
                key={inp.key}
                def={inp}
                value={inputs[inp.key] ?? ""}
                onChange={(v) =>
                  setInputs((prev) => ({ ...prev, [inp.key]: v }))
                }
                disabled={submitting}
              />
            ))}
          </div>

          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Score
            </span>
            <span className="text-lg font-semibold tabular-nums text-slate-900">
              {livePreview !== null ? livePreview.toFixed(2) : "—"}
            </span>
          </div>

          {partial && (
            <p className="text-xs text-amber-700">
              Fill in every input to score this item — or clear them all
              to save only Title/Description changes.
            </p>
          )}

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
              disabled={submitting || partial || !title.trim()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
            >
              {submitting ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ScoreInputField({
  def,
  value,
  onChange,
  disabled,
}: {
  def: ScoreInputDef;
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
}) {
  const id = `poly-input-${def.key}`;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {def.label}
      </label>
      {def.type === "bucket" ? (
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:opacity-60"
        >
          <option value="">— pick one —</option>
          {def.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : def.type === "impact" ? (
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:opacity-60"
        >
          <option value="">— pick one —</option>
          {def.options.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          type="number"
          min={def.min}
          max={def.max}
          step={def.step ?? "any"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={def.placeholder}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm tabular-nums placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:opacity-60"
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────── Toasts ──

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
