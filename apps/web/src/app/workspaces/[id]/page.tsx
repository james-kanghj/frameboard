import Link from "next/link";

import { RICEBoard } from "@/components/RICEBoard";
import { getWorkspace, getWorkspaceBoard } from "@/lib/api";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function WorkspaceBoardPage({ params }: PageProps) {
  const { id } = await params;
  const [workspace, items] = await Promise.all([
    getWorkspace(id),
    getWorkspaceBoard(id),
  ]);

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
