"use client";

// Floating user badge in the top-right corner. Click opens a small
// menu with the full email and a Sign out form action; click outside
// or Escape closes. Hidden entirely when the user isn't signed in
// (the server-side wrapper short-circuits before mounting this).

import { useEffect, useRef, useState } from "react";

import { signOutAction } from "@/auth-actions";

interface Props {
  name: string;
  email: string;
  image: string | null;
}

export function UserBadgeMenu({ name, email, image }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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

  // Initials fallback when there's no avatar image - first letter of
  // the display name (or email's local part) uppercased.
  const initial = (name || email).trim().charAt(0).toUpperCase() || "·";

  return (
    <div
      ref={rootRef}
      className="fixed right-4 top-4 z-40"
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 text-sm shadow-sm transition hover:border-slate-300 hover:shadow"
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            width={24}
            height={24}
            className="h-6 w-6 rounded-full bg-slate-200 object-cover"
          />
        ) : (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[10px] font-semibold text-white">
            {initial}
          </span>
        )}
        <span className="max-w-[10rem] truncate font-medium text-slate-900">
          {name}
        </span>
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
          className="absolute right-0 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-xs uppercase tracking-wider text-slate-500">
              Signed in as
            </p>
            <p className="mt-1 truncate text-sm font-medium text-slate-900">
              {name}
            </p>
            <p className="truncate text-xs text-slate-500">{email}</p>
          </div>
          <form action={signOutAction}>
            <button
              type="submit"
              role="menuitem"
              className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
