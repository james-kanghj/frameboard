export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <div className="space-y-6">
        <span className="inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          v0.1.0 · Pre-alpha
        </span>
        <h1 className="text-5xl font-bold tracking-tight">Frameboard</h1>
        <p className="text-xl text-slate-600">
          An open-source workspace for product teams to run RICE, ICE, MoSCoW,
          and Kano prioritization — without leaving the browser.
        </p>
        <div className="flex flex-wrap gap-3 pt-4">
          <a
            href="https://github.com/james-kanghj/frameboard"
            className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            Star on GitHub
          </a>
          <a
            href="/docs"
            className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-900 hover:bg-slate-50"
          >
            Read the docs
          </a>
        </div>
      </div>

      <section className="mt-20 grid gap-8 sm:grid-cols-2">
        <Feature
          title="Multi-framework"
          body="Compare the same backlog across RICE, ICE, MoSCoW, and Value-vs-Effort in one board."
        />
        <Feature
          title="Collaborative scoring"
          body="Each teammate scores independently. See distribution and disagreement at a glance."
        />
        <Feature
          title="Export-first"
          body="Push to Jira, Linear, Notion, or CSV. Your workflow, no lock-in."
        />
        <Feature
          title="Self-hostable"
          body="One Docker command. Your data stays yours."
        />
      </section>
    </main>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-6">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-slate-600">{body}</p>
    </div>
  );
}
