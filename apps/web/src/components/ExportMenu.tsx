"use client";

// Unified export trigger: a small dropdown with CSV (client-side),
// Notion (server-side), and Linear (server-side) options. Each
// server-side target opens a config-or-export modal driven by the
// per-user integration settings exposed at /v1/users/me.

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type {
  BacklogItem,
  ExportResult,
  Framework,
  UserMe,
  UserMeUpdateInput,
} from "@frameboard/shared";

import {
  exportToLinear,
  exportToNotion,
  getMe,
  updateMe,
} from "@/lib/api";
import { downloadCSV, itemsToCSV } from "@/lib/csv-export";

interface Props {
  workspaceId: string;
  workspaceName: string;
  framework: Framework;
  items: BacklogItem[];
}

type Target = "notion" | "linear";

export function ExportMenu({
  workspaceId,
  workspaceName,
  framework,
  items,
}: Props) {
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<Target | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const empty = items.length === 0;

  useEffect(() => {
    if (!open) return;
    function onClickAway(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickAway);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function handleCsv() {
    setOpen(false);
    downloadCSV(workspaceName, itemsToCSV(items, framework));
  }

  function openTarget(target: Target) {
    setOpen(false);
    setModal(target);
  }

  return (
    <>
      <div ref={rootRef} className="relative">
        <button
          type="button"
          onClick={() => !empty && setOpen((o) => !o)}
          disabled={empty}
          aria-haspopup="menu"
          aria-expanded={open}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          title={
            empty
              ? "Add at least one item to export"
              : "Download items as CSV or push to Notion / Linear"
          }
        >
          Export
          <svg
            viewBox="0 0 16 16"
            width="12"
            height="12"
            aria-hidden="true"
            className={`text-slate-400 transition ${open ? "rotate-180" : ""}`}
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
          <div
            role="menu"
            className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          >
            <MenuItem
              label="CSV"
              hint="Download a spreadsheet"
              onClick={handleCsv}
            />
            <MenuItem
              label="Notion"
              hint="Push items as pages to a database"
              onClick={() => openTarget("notion")}
            />
            <MenuItem
              label="Linear"
              hint="Push items as issues to a team"
              onClick={() => openTarget("linear")}
            />
          </div>
        )}
      </div>

      {modal && (
        <IntegrationExportModal
          target={modal}
          workspaceId={workspaceId}
          workspaceName={workspaceName}
          itemCount={items.length}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}

function MenuItem({
  label,
  hint,
  onClick,
}: {
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
    >
      <div className="font-medium">{label}</div>
      <div className="text-xs text-slate-500">{hint}</div>
    </button>
  );
}

// ───────────────────────────── IntegrationExportModal ──

// Per-target metadata so a single modal component handles both Notion
// and Linear. Adding a third (Jira) would mean adding a row here +
// matching helpers in api.ts and the backend.
interface TargetSpec {
  name: string;
  // Which UserMe field flips to true when credentials are saved.
  isConfigured: (me: UserMe) => boolean;
  // Helper rendered as a numbered list above the first-time setup form.
  setupSteps: ReactNode;
  // Label for the secret field and the placeholder rendered when one
  // is already saved (the value itself is never echoed back).
  tokenLabel: string;
  tokenPlaceholder: string;
  // Public id field — Notion has database id, Linear has team id.
  publicIdLabel: string;
  publicIdPlaceholder: string;
  // Read the saved public id off UserMe, write the credentials back.
  getSavedPublicId: (me: UserMe) => string | null;
  buildUpdate: (token: string, publicId: string) => UserMeUpdateInput;
  // Trigger the actual export against the workspace.
  runExport: (workspaceId: string) => Promise<ExportResult>;
  // What the success summary calls the created object.
  unit: string; // e.g. "page", "issue"
}

const TARGETS: Record<Target, TargetSpec> = {
  notion: {
    name: "Notion",
    isConfigured: (me) => me.notionConfigured,
    setupSteps: (
      <ol className="mt-2 list-decimal space-y-1 pl-4">
        <li>
          Create an integration at{" "}
          <a
            href="https://www.notion.so/my-integrations"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-slate-900"
          >
            notion.so/my-integrations
          </a>
          .
        </li>
        <li>Copy the <em>internal integration secret</em> below.</li>
        <li>
          Open your Notion database, click &middot;&middot;&middot; &gt;{" "}
          <em>Add connections</em> &gt; pick your integration.
        </li>
        <li>
          Copy the database ID from the URL (the 32-char hex part) and
          paste below.
        </li>
      </ol>
    ),
    tokenLabel: "Integration token",
    tokenPlaceholder: "secret_…",
    publicIdLabel: "Database ID",
    publicIdPlaceholder: "e.g. 12ab34cd56ef…",
    getSavedPublicId: (me) => me.notionDatabaseId,
    buildUpdate: (token, publicId) => ({
      notionAccessToken: token,
      notionDatabaseId: publicId,
    }),
    runExport: exportToNotion,
    unit: "page",
  },
  linear: {
    name: "Linear",
    isConfigured: (me) => me.linearConfigured,
    setupSteps: (
      <ol className="mt-2 list-decimal space-y-1 pl-4">
        <li>
          Open Linear &gt; settings &gt;{" "}
          <a
            href="https://linear.app/settings/account/security"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-slate-900"
          >
            Security &amp; access &gt; Personal API keys
          </a>{" "}
          and create a new key.
        </li>
        <li>Paste the <em>lin_api_…</em> key below.</li>
        <li>
          Open the destination team in Linear; the team ID is the long
          UUID under <em>Settings &gt; API</em> (or hover the team to
          inspect the URL).
        </li>
      </ol>
    ),
    tokenLabel: "API key",
    tokenPlaceholder: "lin_api_…",
    publicIdLabel: "Team ID",
    publicIdPlaceholder: "e.g. abc12345-…",
    getSavedPublicId: (me) => me.linearTeamId,
    buildUpdate: (token, publicId) => ({
      linearApiKey: token,
      linearTeamId: publicId,
    }),
    runExport: exportToLinear,
    unit: "issue",
  },
};

type ModalPhase = "loading" | "configure" | "ready" | "exporting" | "done";

function IntegrationExportModal({
  target,
  workspaceId,
  workspaceName,
  itemCount,
  onClose,
}: {
  target: Target;
  workspaceId: string;
  workspaceName: string;
  itemCount: number;
  onClose: () => void;
}) {
  const spec = TARGETS[target];
  const [phase, setPhase] = useState<ModalPhase>("loading");
  const [token, setToken] = useState("");
  const [publicId, setPublicId] = useState("");
  const [savedPublicId, setSavedPublicId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((me) => {
        if (cancelled) return;
        if (spec.isConfigured(me)) {
          const saved = spec.getSavedPublicId(me);
          setSavedPublicId(saved);
          setPublicId(saved ?? "");
          setPhase("ready");
        } else {
          setPhase("configure");
        }
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
        setPhase("configure");
      });
    return () => {
      cancelled = true;
    };
  }, [spec]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && phase !== "exporting") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [phase, onClose]);

  async function handleExport() {
    setError(null);
    setPhase("exporting");
    try {
      const tokenChanged = token.trim().length > 0;
      const publicIdChanged =
        publicId.trim().length > 0 && publicId !== (savedPublicId ?? "");
      if (tokenChanged || publicIdChanged) {
        const update: UserMeUpdateInput = {};
        const built = spec.buildUpdate(
          tokenChanged ? token.trim() : "",
          publicIdChanged ? publicId.trim() : "",
        );
        for (const [k, v] of Object.entries(built)) {
          if (v !== "") update[k as keyof UserMeUpdateInput] = v as string;
        }
        await updateMe(update);
      }
      const res = await spec.runExport(workspaceId);
      setResult(res);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
      setPhase(savedPublicId ? "ready" : "configure");
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={(e) => {
        if (phase !== "exporting" && e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold">Export to {spec.name}</h2>
        <p className="mt-1 text-sm text-slate-600">
          Push the {itemCount} {itemCount === 1 ? "item" : "items"} in{" "}
          <span className="font-medium text-slate-900">{workspaceName}</span>{" "}
          as new {spec.unit}s to {spec.name}.
        </p>

        {phase === "loading" && (
          <p className="mt-6 text-sm text-slate-500">Loading…</p>
        )}

        {(phase === "configure" || phase === "ready") && (
          <div className="mt-6 space-y-4">
            {phase === "configure" && (
              <div className="rounded-md bg-slate-50 px-3 py-3 text-xs text-slate-600">
                <p className="font-medium text-slate-900">First-time setup</p>
                {spec.setupSteps}
              </div>
            )}

            <div>
              <label
                htmlFor="export-token"
                className="block text-sm font-medium text-slate-700"
              >
                {spec.tokenLabel}
                {phase === "ready" && (
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    (leave blank to keep saved)
                  </span>
                )}
              </label>
              <input
                id="export-token"
                type="password"
                autoFocus={phase === "configure"}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={
                  phase === "ready"
                    ? "•••••••• (saved)"
                    : spec.tokenPlaceholder
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              />
            </div>

            <div>
              <label
                htmlFor="export-public-id"
                className="block text-sm font-medium text-slate-700"
              >
                {spec.publicIdLabel}
              </label>
              <input
                id="export-public-id"
                type="text"
                value={publicId}
                onChange={(e) => setPublicId(e.target.value)}
                placeholder={spec.publicIdPlaceholder}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              />
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700"
              >
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExport}
                disabled={
                  phase === "configure" &&
                  (token.trim().length === 0 ||
                    publicId.trim().length === 0)
                }
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
              >
                {phase === "ready" ? "Export" : "Save & export"}
              </button>
            </div>
          </div>
        )}

        {phase === "exporting" && (
          <p className="mt-6 text-sm text-slate-600">
            Exporting {itemCount} {itemCount === 1 ? "item" : "items"} to{" "}
            {spec.name}… this can take a few seconds per {spec.unit}.
          </p>
        )}

        {phase === "done" && result && (
          <div className="mt-6 space-y-3">
            <p className="text-sm">
              <span className="font-medium text-slate-900">
                {result.created} {result.created === 1 ? spec.unit : spec.unit + "s"}{" "}
                created
              </span>
              {result.failed > 0 && (
                <span className="text-red-700">
                  {" "}· {result.failed} failed
                </span>
              )}
            </p>
            {result.failures.length > 0 && (
              <details className="rounded-md bg-red-50 p-3 text-xs text-red-700">
                <summary className="cursor-pointer font-medium">
                  Failures
                </summary>
                <ul className="mt-2 space-y-1">
                  {result.failures.map((f, i) => (
                    <li key={i}>
                      <span className="font-medium">{f.title}:</span> {f.error}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
