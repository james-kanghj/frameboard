export const runtime = "edge";

import { notFound } from "next/navigation";
import Link from "next/link";

import type { BacklogItem, Workspace } from "@frameboard/shared";

import { PolymorphicBoard } from "@/components/PolymorphicBoard";
import { RICEBoard } from "@/components/RICEBoard";
import { ApiError, getWorkspace, getWorkspaceBoard } from "@/lib/api";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function WorkspaceBoardPage({ params }: PageProps) {
  const { id } = await params;

  // Translate backend 404s into Next's notFound() so the user gets the
  // standard not-found page rather than a generic error. Other failures
  // (backend down, 500s) still bubble up to the error boundary.
  let workspace: Workspace;
  let items: BacklogItem[];
  try {
    [workspace, items] = await Promise.all([
      getWorkspace(id),
      getWorkspaceBoard(id),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  // Dispatch on framework: RICE keeps its full-featured board (inline
  // editing, charts, effort/score bucket filters); the other three
  // frameworks render the leaner polymorphic board with a
  // framework-aware scoring modal. This isolates the RICE-shaped
  // affordances from boards that don't have a notion of effort or a
  // numeric impact axis.
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Link
        href="/workspaces"
        className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700"
      >
        ← All workspaces
      </Link>
      {workspace.framework === "RICE" ? (
        <RICEBoard
          workspaceId={id}
          workspaceName={workspace.name}
          workspaceOwnerId={workspace.ownerId}
          initialItems={items}
        />
      ) : (
        <PolymorphicBoard
          workspaceId={id}
          workspaceName={workspace.name}
          workspaceOwnerId={workspace.ownerId}
          framework={workspace.framework}
          initialItems={items}
        />
      )}
    </main>
  );
}
