// /apps/web/src/middleware.ts
//
// Protects /workspaces/* by redirecting unauthenticated visitors to
// the sign-in page. Bypassed when NEXT_PUBLIC_AUTH_DISABLED=1 so
// contributors can run the stack without registering an OAuth app —
// matches the backend's AUTH_DISABLED=1 behaviour.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { auth } from "@/auth";

const AUTH_DISABLED =
  process.env.NEXT_PUBLIC_AUTH_DISABLED === "1" ||
  process.env.NEXT_PUBLIC_AUTH_DISABLED === "true";

export async function middleware(req: NextRequest) {
  if (AUTH_DISABLED) {
    return NextResponse.next();
  }
  const session = await auth();
  if (!session?.user?.email) {
    const signInUrl = new URL("/auth/signin", req.url);
    // Preserve where the user was headed so we can bounce back.
    signInUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }
  return NextResponse.next();
}

export const config = {
  // Only protect the authenticated app surface. The landing page,
  // auth routes, and static assets stay open.
  matcher: ["/workspaces/:path*"],
};
