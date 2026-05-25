// /apps/web/src/app/auth/signin/page.tsx

export const runtime = "edge";

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { signInWithGitHub } from "@/auth-actions";

interface Props {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}

export default async function SignInPage({ searchParams }: Props) {
  const params = await searchParams;
  const callbackUrl = params.callbackUrl ?? "/workspaces";

  // Already signed in? Just bounce. A stale / wrong-secret cookie can
  // make Auth.js throw `JWTSessionError` instead of returning null —
  // catch and treat as "not signed in" so the page still renders and
  // the user can re-authenticate.
  let session = null;
  try {
    session = await auth();
  } catch {
    session = null;
  }
  if (session?.user?.email) {
    redirect(callbackUrl);
  }

  const showError = Boolean(params.error);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Frameboard
          </p>
          <h1 className="text-3xl font-bold tracking-tight">Sign in</h1>
          <p className="text-sm text-slate-600">
            Frameboard uses GitHub to identify you across workspaces.
          </p>
        </div>

        {showError && (
          <p
            role="alert"
            className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            Sign-in failed. Please try again.
          </p>
        )}

        <form action={signInWithGitHub}>
          {/* The action reads `callbackUrl` off FormData instead of
              capturing it via closure, so we round-trip it through a
              hidden input. */}
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            <svg
              viewBox="0 0 16 16"
              width="16"
              height="16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
            </svg>
            Sign in with GitHub
          </button>
        </form>

        <p className="text-xs text-slate-500">
          By signing in you agree to Frameboard&apos;s{" "}
          <a
            href="https://github.com/james-kanghj/frameboard"
            className="underline hover:text-slate-700"
          >
            open-source terms
          </a>
          .
        </p>
      </div>
    </main>
  );
}
