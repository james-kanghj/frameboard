"use client";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

// Fallback when the root layout itself fails to render. Owns its own
// <html>/<body> because the normal layout chain is unavailable here.
// Plain <a> tags (not next/link) so navigation works even if the client
// router never bootstrapped.
export default function GlobalError({ error, reset }: Props) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-slate-900 antialiased">
        <main className="mx-auto max-w-3xl px-6 py-24">
          <div className="space-y-6">
            <span className="inline-block rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
              Critical error
            </span>
            <h1 className="text-5xl font-bold tracking-tight">
              Frameboard couldn’t load
            </h1>
            <p className="text-xl text-slate-600">
              The application failed to start. This usually means a bad
              deployment. Try again in a moment.
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
              {/* Plain anchor is intentional: when the root layout fails the
                  client router may not be available. eslint-disable-next-line */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/"
                className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-900 hover:bg-slate-50"
              >
                Back home
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
