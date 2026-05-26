"use client";

// Unified export trigger: a small dropdown with CSV (client-side) and
// Notion (server-side) options. Replaces the standalone "Export CSV"
// button on both boards so the export surface stays in one place as
// more integrations land (Linear / Jira next).

import { useEffect, useRef, useState } from "react";

import type { BacklogItem, ExportResult, Framework } from "@frameboard/shared";

import { exportToNotion, getMe, updateMe } from "@/lib/api";
import { downloadCSV, itemsToCSV } from "@/lib/csv-export";

interface Props {
  workspaceId: string;
  workspaceName: string;
  framework: Framework;
  items: BacklogItem[];
}

type Modal = null | "notion";

export function ExportMenu({
  workspaceId,
  workspaceName,
  framework,
  items,
}: Props) {
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
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

  function handleNotion() {
    setOpen(false);
    setModal("notion");
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
              : "Download items as CSV or push to Notion"
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
            <button
              type="button"
              role="menuitem"
              onClick={handleCsv}
              className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              <div className="font-medium">CSV</div>
              <div className="text-xs text-slate-500">
                Download a spreadsheet
              </div>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={handleNotion}
              className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              <div className="font-medium">Notion</div>
              <div className="text-xs text-slate-500">
                Push items as pages to a database
              </div>
            </button>
          </div>
        )}
      </div>

      {modal === "notion" && (
        <NotionExportModal
          workspaceId={workspaceId}
          workspaceName={workspaceName}
          itemCount={items.length}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────── NotionExportModal ──

type ModalPhase = "loading" | "configure" | "ready" | "exporting" | "done";

function NotionExportModal({
  workspaceId,
  workspaceName,
  itemCount,
  onClose,
}: {
  workspaceId: string;
  workspaceName: string;
  itemCount: number;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<ModalPhase>("loading");
  const [token, setToken] = useState("");
  const [databaseId, setDatabaseId] = useState("");
  const [savedDatabaseId, setSavedDatabaseId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);

  // Bootstrap: ask the API whether the user already has Notion
  // credentials saved. If yes, jump straight to "ready"; otherwise
  // surface the config form.
  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((me) => {
        if (cancelled) return;
        if (me.notionConfigured) {
          setSavedDatabaseId(me.notionDatabaseId);
          setDatabaseId(me.notionDatabaseId ?? "");
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
  }, []);

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
      // If the user is editing the credentials (changed inputs from
      // what's saved), persist them first. Otherwise jump straight to
      // the export.
      const tokenChanged = token.trim().length > 0;
      const databaseChanged =
        databaseId.trim().length > 0 && databaseId !== (savedDatabaseId ?? "");
      if (tokenChanged || databaseChanged) {
        await updateMe({
          ...(tokenChanged ? { notionAccessToken: token.trim() } : {}),
          ...(databaseChanged ? { notionDatabaseId: databaseId.trim() } : {}),
        });
      }
      const res = await exportToNotion(workspaceId);
      setResult(res);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
      setPhase(savedDatabaseId ? "ready" : "configure");
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
        <h2 className="text-lg font-semibold">Export to Notion</h2>
        <p className="mt-1 text-sm text-slate-600">
          Push the {itemCount} {itemCount === 1 ? "item" : "items"} in{" "}
          <span className="font-medium text-slate-900">{workspaceName}</span>{" "}
          as new pages in your Notion database.
        </p>

        {phase === "loading" && (
          <p className="mt-6 text-sm text-slate-500">Loading…</p>
        )}

        {(phase === "configure" || phase === "ready") && (
          <div className="mt-6 space-y-4">
            {phase === "configure" && (
              <div className="rounded-md bg-slate-50 px-3 py-3 text-xs text-slate-600">
                <p className="font-medium text-slate-900">
                  First-time setup
                </p>
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
                  <li>
                    Copy the <em>internal integration secret</em> below.
                  </li>
                  <li>
                    Open your Notion database, click &middot;&middot;&middot;
                    &gt; <em>Add connections</em> &gt; pick your integration.
                  </li>
                  <li>
                    Copy the database ID from the URL (the 32-char hex part)
                    and paste below.
                  </li>
                </ol>
              </div>
            )}

            <div>
              <label
                htmlFor="notion-token"
                className="block text-sm font-medium text-slate-700"
              >
                Integration token
                {phase === "ready" && (
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    (leave blank to keep saved)
                  </span>
                )}
              </label>
              <input
                id="notion-token"
                type="password"
                autoFocus={phase === "configure"}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={
                  phase === "ready"
                    ? "•••••••• (saved)"
                    : "secret_..."
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              />
            </div>

            <div>
              <label
                htmlFor="notion-db"
                className="block text-sm font-medium text-slate-700"
              >
                Database ID
              </label>
              <input
                id="notion-db"
                type="text"
                value={databaseId}
                onChange={(e) => setDatabaseId(e.target.value)}
                placeholder="e.g. 12ab34cd56ef…"
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
                  (token.trim().length === 0 || databaseId.trim().length === 0)
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
            Exporting {itemCount} {itemCount === 1 ? "item" : "items"} to
            Notion… this can take a few seconds per page.
          </p>
        )}

        {phase === "done" && result && (
          <div className="mt-6 space-y-3">
            <p className="text-sm">
              <span className="font-medium text-slate-900">
                {result.created} {result.created === 1 ? "page" : "pages"}{" "}
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
                      <span className="font-medium">{f.title}:</span>{" "}
                      {f.error}
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
