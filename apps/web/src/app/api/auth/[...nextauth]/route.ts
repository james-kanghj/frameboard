// /apps/web/src/app/api/auth/[...nextauth]/route.ts
//
// Mounts NextAuth's HTTP handlers under /api/auth/* (sign-in,
// callback, sign-out, session). Implementation lives in src/auth.ts.

export const runtime = "edge";

export { GET, POST } from "@/auth-handlers";
