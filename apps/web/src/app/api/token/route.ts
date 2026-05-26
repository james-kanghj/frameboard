// /apps/web/src/app/api/token/route.ts
//
// Returns the raw session JWT cookie to the client so the in-browser
// API client can attach it as `Authorization: Bearer <jwt>` when
// calling the FastAPI backend. The cookie itself is HTTP-only (set by
// NextAuth) so JS can't read it - this endpoint is the bridge.

export const runtime = "edge";

import { cookies } from "next/headers";

const COOKIE_NAMES = [
  "authjs.session-token", // dev/HTTP
  "__Secure-authjs.session-token", // production/HTTPS
];

export async function GET() {
  const jar = await cookies();
  for (const name of COOKIE_NAMES) {
    const c = jar.get(name);
    if (c?.value) {
      return Response.json({ token: c.value });
    }
  }
  return new Response(null, { status: 401 });
}
