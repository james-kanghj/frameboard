"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import { createPortal } from "react-dom";

import type { BacklogItem, RICEImpact } from "@frameboard/shared";

import { createItem, deleteItem, scoreRICE } from "@/lib/api";

const IMPACT_OPTIONS: RICEImpact[] = [0.25, 0.5, 1, 2, 3];

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

export function RICEBoard({ workspaceId, workspaceName, initialItems }: Props) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [addOpen, setAddOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Resync local state when the server component refetches (router.refresh).
  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

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
            {items.length} {items.length === 1 ? "item" : "items"}
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
          <BoardTable
            items={items}
            setItems={setItems}
            pushToast={pushToast}
            refresh={() => router.refresh()}
          />
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

      <ToastStack toasts={toasts} />
    </section>
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
}

function BoardTable({ items, setItems, pushToast, refresh }: TableProps) {
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
}

function BoardRow({ item, rank, setItems, pushToast, refresh }: RowProps) {
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

      <RowMenu onDelete={handleDelete} />
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
        <select
          value={impact}
          onChange={(e) => onChangeField("impact", Number(e.target.value))}
          className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm focus:border-slate-500 focus:outline-none"
        >
          {IMPACT_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
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
        <select
          value={impact}
          onChange={(e) => setImpact(Number(e.target.value) as RICEImpact)}
          className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm focus:border-slate-500 focus:outline-none"
        >
          {IMPACT_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
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

function RowMenu({ onDelete }: { onDelete: () => void }) {
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
              disabled
              title="Coming in Step 6"
              className="block w-full px-3 py-1.5 text-left text-sm text-slate-400"
            >
              Edit (soon)
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
