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
  // A stale cookie signed with a previous NEXTAUTH_SECRET makes Auth.js
  // throw JWTSessionError. Treat any decode failure as "no session" so
  // the user is bounced to /auth/signin (where they can re-authenticate)
  // instead of seeing a 500 dev overlay.
  let session = null;
  try {
    session = await auth();
  } catch {
    session = null;
  }
  if (!session?.user?.email) {
    const signInUrl = new URL("/auth/signin", req.url);
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
