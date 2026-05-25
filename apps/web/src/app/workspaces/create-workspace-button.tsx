"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { Framework } from "@frameboard/shared";

import { createWorkspace } from "@/lib/api";

interface FrameworkOption {
  value: Framework;
  label: string;
  formula: string;
}

// The framework selector renders a custom dropdown rather than a native
// <select> so the option list inherits the modal's styling (light surface,
// rounded corners, hover states) instead of the browser's OS-themed menu.
const FRAMEWORK_OPTIONS: FrameworkOption[] = [
  { value: "RICE", label: "RICE", formula: "Reach × Impact × Confidence ÷ Effort" },
  { value: "ICE", label: "ICE", formula: "Impact × Confidence × Ease" },
  { value: "ValueEffort", label: "Value × Effort", formula: "Value ÷ Effort" },
  { value: "MoSCoW", label: "MoSCoW", formula: "Must / Should / Could / Won't" },
];

export function CreateWorkspaceButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
      >
        Create workspace
      </button>
      {open && <CreateWorkspaceModal onClose={() => setOpen(false)} />}
    </>
  );
}

// Custom listbox-style framework picker. Button trigger that shows the
// active label + formula; click reveals a panel of all four options.
// Keyboard support: ArrowUp/Down to move, Enter/Space to select, Escape
// to close. No portal needed — the panel lives inside the modal so the
// modal's stacking context already lifts it above page content.
function FrameworkSelect({
  value,
  onChange,
  disabled,
  inputId,
}: {
  value: Framework;
  onChange: (next: Framework) => void;
  disabled?: boolean;
  inputId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(() =>
    FRAMEWORK_OPTIONS.findIndex((o) => o.value === value),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const selected =
    FRAMEWORK_OPTIONS.find((o) => o.value === value) ?? FRAMEWORK_OPTIONS[0];

  // Close on outside click + Escape. Listeners only attach while open
  // to keep the global event surface minimal.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function commit(next: Framework) {
    onChange(next);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function onTriggerKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex(FRAMEWORK_OPTIONS.findIndex((o) => o.value === value));
    }
  }

  function onListKeyDown(e: React.KeyboardEvent<HTMLUListElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % FRAMEWORK_OPTIONS.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) =>
        i <= 0 ? FRAMEWORK_OPTIONS.length - 1 : i - 1,
      );
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const opt = FRAMEWORK_OPTIONS[activeIndex];
      if (opt) commit(opt.value);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(FRAMEWORK_OPTIONS.length - 1);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        id={inputId}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKeyDown}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:opacity-60"
      >
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="font-medium text-slate-900">{selected.label}</span>
          <span className="truncate text-xs text-slate-500">
            {selected.formula}
          </span>
        </span>
        <svg
          viewBox="0 0 16 16"
          width="14"
          height="14"
          aria-hidden="true"
          className={`shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`}
        >
          <path
            d="M4 6l4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <ul
          role="listbox"
          aria-activedescendant={`framework-opt-${activeIndex}`}
          tabIndex={-1}
          autoFocus
          onKeyDown={onListKeyDown}
          // Focus the list synchronously on open so arrow keys work.
          ref={(el) => el?.focus()}
          className="absolute left-0 right-0 z-10 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg focus:outline-none"
        >
          {FRAMEWORK_OPTIONS.map((opt, idx) => {
            const isSelected = opt.value === value;
            const isActive = idx === activeIndex;
            return (
              <li
                id={`framework-opt-${idx}`}
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => commit(opt.value)}
                className={`flex cursor-pointer items-baseline gap-2 px-3 py-2 text-sm ${
                  isActive ? "bg-slate-100" : "bg-white"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`w-3 shrink-0 text-slate-500 ${isSelected ? "" : "invisible"}`}
                >
                  ✓
                </span>
                <span className="flex min-w-0 flex-1 items-baseline gap-2">
                  <span className="font-medium text-slate-900">{opt.label}</span>
                  <span className="truncate text-xs text-slate-500">
                    {opt.formula}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function CreateWorkspaceModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [framework, setFramework] = useState<Framework>("RICE");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createWorkspace({ name: trimmed, framework });
      router.refresh();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create workspace",
      );
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-workspace-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="create-workspace-title" className="text-lg font-semibold">
          New workspace
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Workspaces hold a backlog and its scoring history.
        </p>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label
              htmlFor="workspace-name"
              className="block text-sm font-medium text-slate-700"
            >
              Name
            </label>
            <input
              id="workspace-name"
              name="name"
              type="text"
              autoFocus
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              placeholder="Q2 roadmap"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:opacity-60"
            />
          </div>
          <div>
            <label
              htmlFor="workspace-framework"
              className="block text-sm font-medium text-slate-700"
            >
              Framework
            </label>
            <div className="mt-1">
              <FrameworkSelect
                value={framework}
                onChange={setFramework}
                disabled={submitting}
                inputId="workspace-framework"
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Determines the scoring inputs and how the board sorts. Can be
              changed later from the workspace.
            </p>
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {error}
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
              disabled={submitting}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
            >
              {submitting ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
