"use client";

import { useEffect, useState, type FormEvent } from "react";

import type { BacklogItem, RICEImpact } from "@frameboard/shared";

import { ApiError, scoreRICE, updateItem } from "@/lib/api";
import { ImpactSelect } from "@/components/ImpactSelect";

interface Props {
  item: BacklogItem;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}

export function EditItemModal({ item, onClose, onSaved, onError }: Props) {
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? "");
  const [reach, setReach] = useState<string>(
    item.riceScore !== null ? String(item.riceScore.reach) : "",
  );
  const [impact, setImpact] = useState<RICEImpact>(
    (item.riceScore?.impact as RICEImpact | undefined) ?? 1,
  );
  const [confidence, setConfidence] = useState<string>(
    item.riceScore !== null ? String(item.riceScore.confidence) : "",
  );
  const [effort, setEffort] = useState<string>(
    item.riceScore !== null ? String(item.riceScore.effort) : "",
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

  const titleValid = title.trim().length > 0;
  const reachN = Number(reach);
  const confidenceN = Number(confidence);
  const effortN = Number(effort);
  const numericsFilled = reach !== "" && confidence !== "" && effort !== "";
  const numericsEmpty = reach === "" && confidence === "" && effort === "";
  const ricePartial = !numericsFilled && !numericsEmpty;
  const riceValid =
    numericsFilled &&
    Number.isFinite(reachN) &&
    reachN >= 0 &&
    Number.isFinite(confidenceN) &&
    confidenceN >= 0 &&
    confidenceN <= 1 &&
    Number.isFinite(effortN) &&
    effortN > 0;

  // Save is enabled when title is non-empty AND either the RICE block is
  // entirely blank (text-only save) OR all four RICE fields are valid.
  // Partial RICE blocks save until the user fills the rest or clears them.
  const canSave =
    titleValid &&
    !ricePartial &&
    (numericsFilled ? riceValid : true) &&
    !submitting;

  const liveScore =
    numericsFilled && riceValid
      ? Math.round(((reachN * impact * confidenceN) / effortN) * 100) / 100
      : null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSave) return;

    const newTitle = title.trim();
    const newDescription = description.trim() || null;
    const titleChanged = newTitle !== item.title;
    const descriptionChanged = newDescription !== item.description;

    const existing = item.riceScore;
    const riceShouldSubmit = numericsFilled && riceValid;
    const riceChanged =
      riceShouldSubmit &&
      (existing === null ||
        reachN !== existing.reach ||
        impact !== existing.impact ||
        confidenceN !== existing.confidence ||
        effortN !== existing.effort);

    const promises: Promise<unknown>[] = [];
    if (titleChanged || descriptionChanged) {
      const patch: { title?: string; description?: string | null } = {};
      if (titleChanged) patch.title = newTitle;
      if (descriptionChanged) patch.description = newDescription;
      promises.push(updateItem(item.id, patch));
    }
    if (riceChanged) {
      promises.push(
        scoreRICE({
          itemId: item.id,
          reach: reachN,
          impact,
          confidence: confidenceN,
          effort: effortN,
        }),
      );
    }

    if (promises.length === 0) {
      // Nothing to save — treat the click as a Cancel.
      onClose();
      return;
    }

    setSubmitting(true);
    try {
      await Promise.all(promises);
      onSaved();
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        onError("Item no longer exists");
        onClose();
        return;
      }
      onError(err instanceof Error ? err.message : "Failed to save item");
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-item-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="edit-item-title" className="text-lg font-semibold">
          Edit item
        </h2>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label
              htmlFor="edit-title"
              className="block text-sm font-medium text-slate-700"
            >
              Title
            </label>
            <input
              id="edit-title"
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
            <label
              htmlFor="edit-description"
              className="block text-sm font-medium text-slate-700"
            >
              Description <span className="text-slate-400">(optional)</span>
            </label>
            <textarea
              id="edit-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={submitting}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:opacity-60"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="edit-reach"
                className="block text-sm font-medium text-slate-700"
              >
                Reach
              </label>
              <input
                id="edit-reach"
                type="number"
                min={0}
                step={1}
                value={reach}
                onChange={(e) => setReach(e.target.value)}
                disabled={submitting}
                placeholder="e.g. 1000"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm tabular-nums placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:opacity-60"
              />
            </div>

            <div>
              <label
                htmlFor="edit-impact"
                className="block text-sm font-medium text-slate-700"
              >
                Impact
              </label>
              <div className="mt-1">
                <ImpactSelect
                  value={impact}
                  onChange={setImpact}
                  disabled={submitting}
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="edit-confidence"
                className="block text-sm font-medium text-slate-700"
              >
                Confidence
              </label>
              <input
                id="edit-confidence"
                type="number"
                min={0}
                max={1}
                step={0.1}
                value={confidence}
                onChange={(e) => setConfidence(e.target.value)}
                disabled={submitting}
                placeholder="0.0 – 1.0"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm tabular-nums placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:opacity-60"
              />
            </div>

            <div>
              <label
                htmlFor="edit-effort"
                className="block text-sm font-medium text-slate-700"
              >
                Effort
              </label>
              <input
                id="edit-effort"
                type="number"
                min={0.01}
                step={0.1}
                value={effort}
                onChange={(e) => setEffort(e.target.value)}
                disabled={submitting}
                placeholder="Person-months"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm tabular-nums placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:opacity-60"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Score
            </span>
            <span className="text-lg font-semibold tabular-nums text-slate-900">
              {liveScore !== null ? liveScore.toFixed(2) : "—"}
            </span>
          </div>

          {ricePartial && (
            <p className="text-xs text-amber-700">
              Fill in all of Reach, Confidence, and Effort to score this item —
              or clear them all to save only Title/Description changes.
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
              disabled={!canSave}
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
