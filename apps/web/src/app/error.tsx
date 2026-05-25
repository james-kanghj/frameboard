"use client";

import Link from "next/link";
import { useEffect } from "react";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorBoundary({ error, reset }: Props) {
  useEffect(() => {
    // Logged to the browser console + (via Cloudflare) `wrangler tail`.
    // Swap for Sentry/Logflare when we wire up real error reporting.
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <div className="space-y-6">
        <span className="inline-block rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
          Something broke
        </span>
        <h1 className="text-5xl font-bold tracking-tight">
          We hit an unexpected error
        </h1>
        <p className="text-xl text-slate-600">
          Frameboard couldn’t finish rendering this page. The most common
          cause is the API being temporarily unreachable. You can retry, or
          head back to your boards.
        </p>
        {error.digest && (
          <p className="font-mono text-xs text-slate-500">
            ref: {error.digest}
          </p>
        )}
        <div className="flex flex-wrap gap-3 pt-4">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            Try again
          </button>
          <Link
            href="/workspaces"
            className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-900 hover:bg-slate-50"
          >
            Go to workspaces
          </Link>
        </div>
      </div>
    </main>
  );
}
