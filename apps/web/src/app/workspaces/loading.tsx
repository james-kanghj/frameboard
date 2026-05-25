export default function Loading() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <div className="space-y-3">
        <div className="h-3 w-20 animate-pulse rounded bg-slate-200" />
        <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
        <div className="h-3 w-72 animate-pulse rounded bg-slate-200" />
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
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
