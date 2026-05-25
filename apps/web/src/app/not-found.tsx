// Edge runtime so the not-found page shares the root layout, which
// calls `auth()` via UserBadge. Cloudflare Pages rejects the build
// without an explicit edge runtime on every non-static route.
export const runtime = "edge";

import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <div className="space-y-6">
        <span className="inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          404 · Not found
        </span>
        <h1 className="text-5xl font-bold tracking-tight">
          This page doesn’t exist
        </h1>
        <p className="text-xl text-slate-600">
          The URL you opened doesn’t match any page in Frameboard. The link
          may be stale, or the workspace you were looking for has been
          deleted.
        </p>
        <div className="flex flex-wrap gap-3 pt-4">
          <Link
            href="/workspaces"
            className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            Go to workspaces →
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-900 hover:bg-slate-50"
          >
            Back home
          </Link>
        </div>
      </div>
    </main>
  );
}
