import { notFound } from "next/navigation";
import Link from "next/link";

import type { BacklogItem, Workspace } from "@frameboard/shared";

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

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Link
        href="/workspaces"
        className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700"
      >
        ← All workspaces
      </Link>
      <RICEBoard
        workspaceId={id}
        workspaceName={workspace.name}
        initialItems={items}
      />
    </main>
  );
}
