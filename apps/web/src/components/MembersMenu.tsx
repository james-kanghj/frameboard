"use client";

// "Members" button on the workspace header + modal that lists existing
// members and accepts an email invite. The button always renders the
// count once it's loaded so the user knows how many collaborators are
// on the workspace at a glance.

import { useEffect, useState, type FormEvent } from "react";

import type { WorkspaceMember } from "@frameboard/shared";

import { inviteMember, listMembers, removeMember } from "@/lib/api";

interface Props {
  workspaceId: string;
  workspaceOwnerId: string;
}

export function MembersMenu({ workspaceId, workspaceOwnerId }: Props) {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<WorkspaceMember[] | null>(null);

  // Pre-load the count so the button can show it without waiting for
  // the modal to open. Re-fetches on every successful invite/remove
  // via setMembers.
  useEffect(() => {
    let cancelled = false;
    listMembers(workspaceId)
      .then((m) => {
        if (!cancelled) setMembers(m);
      })
      .catch(() => {
        // Quietly fail — the button just shows "Members" without a
        // count, and the modal will surface the error if the user
        // opens it.
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        title="Manage workspace members"
      >
        <svg
          viewBox="0 0 16 16"
          width="14"
          height="14"
          aria-hidden="true"
          className="text-slate-500"
        >
          <path
            d="M6 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM6 8.5c-2.5 0-4.5 1.2-4.5 3v.5h9V11.5c0-1.8-2-3-4.5-3zm6-3.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm-.5 1.5c-.6 0-1.1.1-1.6.3.4.5.6 1.1.7 1.7h4.4c0-1.5-1.5-2-3.5-2z"
            fill="currentColor"
          />
        </svg>
        Members
        {members !== null && (
          <span className="rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">
            {members.length}
          </span>
        )}
      </button>
      {open && (
        <MembersModal
          workspaceId={workspaceId}
          workspaceOwnerId={workspaceOwnerId}
          initial={members}
          onClose={() => setOpen(false)}
          onChange={(next) => setMembers(next)}
        />
      )}
    </>
  );
}

function MembersModal({
  workspaceId,
  workspaceOwnerId,
  initial,
  onClose,
  onChange,
}: {
  workspaceId: string;
  workspaceOwnerId: string;
  initial: WorkspaceMember[] | null;
  onClose: () => void;
  onChange: (next: WorkspaceMember[]) => void;
}) {
  const [members, setMembers] = useState<WorkspaceMember[] | null>(initial);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refresh on open in case something changed since the button last
  // loaded its count.
  useEffect(() => {
    let cancelled = false;
    listMembers(workspaceId)
      .then((m) => {
        if (cancelled) return;
        setMembers(m);
        onChange(m);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
    // onChange would otherwise re-trigger this effect every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

  async function handleInvite(event: FormEvent) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await inviteMember(workspaceId, { email: trimmed });
      // Merge — if it's an existing member the response IDs match and
      // the list de-dupes. Otherwise it's appended.
      setMembers((curr) => {
        if (!curr) return [created];
        if (curr.some((m) => m.id === created.id)) return curr;
        const next = [...curr, created];
        onChange(next);
        return next;
      });
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(userId: string) {
    setError(null);
    const previous = members;
    setMembers((curr) =>
      curr ? curr.filter((m) => m.userId !== userId) : curr,
    );
    try {
      await removeMember(workspaceId, userId);
      if (members) {
        const next = members.filter((m) => m.userId !== userId);
        onChange(next);
      }
    } catch (err) {
      // Roll back optimistic removal.
      setMembers(previous);
      setError(err instanceof Error ? err.message : "Remove failed");
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold">Members</h2>
        <p className="mt-1 text-sm text-slate-600">
          Invite teammates to read, score, and edit this workspace. Only
          the owner can manage members and change workspace settings.
        </p>

        <form
          className="mt-6 flex items-center gap-2"
          onSubmit={handleInvite}
        >
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
            placeholder="teammate@example.com"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={submitting || !email.trim()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {submitting ? "Inviting…" : "Invite"}
          </button>
        </form>

        {error && (
          <p
            role="alert"
            className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700"
          >
            {error}
          </p>
        )}

        <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {members === null && (
            <li className="px-4 py-3 text-xs text-slate-500">Loading…</li>
          )}
          {members?.map((m) => {
            const isPrimaryOwner = m.userId === workspaceOwnerId;
            return (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {m.displayName}
                  </p>
                  <p className="truncate text-xs text-slate-500">{m.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                      m.role === "owner"
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {m.role}
                  </span>
                  {!isPrimaryOwner && (
                    <button
                      type="button"
                      onClick={() => handleRemove(m.userId)}
                      aria-label={`Remove ${m.displayName}`}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      title="Remove member"
                    >
                      ×
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
