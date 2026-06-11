export default function Loading() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <div className="space-y-3">
        <div className="h-3 w-20 animate-pulse rounded bg-slate-200" />
        <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
        <div className="h-3 w-72 animate-pulse rounded bg-slate-200" />
      </div>

      <div
        role="status"
        aria-live="polite"
        className="mt-8 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-600"
      >
        <svg
          className="h-4 w-4 shrink-0 animate-spin text-slate-500"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
        <div className="flex flex-col">
          <span className="font-medium text-slate-700">
            Loading workspaces...
          </span>
          <span className="text-xs text-slate-500">
            The API runs on a free tier, so the first request after idle may
            take 30-60s to wake up (cold start).
          </span>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-xl border border-slate-200 bg-slate-50"
          />
        ))}
      </div>
    </main>
  );
}
