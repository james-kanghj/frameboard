export const runtime = "edge";

import Link from "next/link";

import { listWorkspaces } from "@/lib/api";

import { CreateWorkspaceButton } from "./create-workspace-button";

export default async function WorkspacesPage() {
  const workspaces = await listWorkspaces();

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Workspaces
          </p>
          <h1 className="text-3xl font-bold tracking-tight">Your boards</h1>
          <p className="text-sm text-slate-600">
            Each workspace holds a backlog and its prioritization scoring.
          </p>
        </div>
        <CreateWorkspaceButton />
      </header>

      <section className="mt-10">
        {workspaces.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {workspaces.map((ws) => (
              <li key={ws.id}>
                <Link
                  href={`/workspaces/${ws.id}`}
                  className="block rounded-xl border border-slate-200 p-6 transition hover:border-slate-300 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-lg font-semibold text-slate-900">
                      {ws.name}
                    </h2>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-600">
                      {ws.framework}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Updated{" "}
                    {new Date(ws.updatedAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-12 text-center">
      <h2 className="text-lg font-semibold text-slate-900">
        No workspaces yet
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-slate-600">
        Spin up your first board to start scoring items.
      </p>
      <div className="mt-6 inline-flex">
        <CreateWorkspaceButton />
      </div>
    </div>
  );
}
