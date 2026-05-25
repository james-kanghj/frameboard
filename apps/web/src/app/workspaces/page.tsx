import Link from "next/link";

import { listWorkspaces } from "@/lib/api";

import { CreateWorkspaceButton } from "./create-workspace-button";

// TODO(auth): replace with the authenticated user's email once real auth
// (NextAuth/JWT) lands. Hardcoded for now since this is a single-user MVP.
const CURRENT_USER_EMAIL = process.env.NEXT_PUBLIC_DEV_USER_EMAIL ?? "[email protected]";

export default async function WorkspacesPage() {
  const workspaces = await listWorkspaces(CURRENT_USER_EMAIL);

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Workspaces
          </p>
          <h1 className="text-3xl font-bold tracking-tight">Your boards</h1>
          <p className="text-sm text-slate-600">
            Each workspace holds a backlog and its RICE scoring.
          </p>
        </div>
        <CreateWorkspaceButton ownerEmail={CURRENT_USER_EMAIL} />
      </header>

      <section className="mt-10">
        {workspaces.length === 0 ? (
          <EmptyState ownerEmail={CURRENT_USER_EMAIL} />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {workspaces.map((ws) => (
              <li key={ws.id}>
                <Link
                  href={`/workspaces/${ws.id}`}
                  className="block rounded-xl border border-slate-200 p-6 transition hover:border-slate-300 hover:shadow-sm"
                >
                  <h2 className="text-lg font-semibold text-slate-900">
                    {ws.name}
                  </h2>
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

function EmptyState({ ownerEmail }: { ownerEmail: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-12 text-center">
      <h2 className="text-lg font-semibold text-slate-900">
        No workspaces yet
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-slate-600">
        Spin up your first board to start scoring items with RICE.
      </p>
      <div className="mt-6 inline-flex">
        <CreateWorkspaceButton ownerEmail={ownerEmail} />
      </div>
    </div>
  );
}
