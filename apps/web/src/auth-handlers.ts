// /apps/web/src/auth-handlers.ts
//
// Tiny module that just re-exports NextAuth's HTTP handlers. Kept
// separate from src/auth.ts so the route handler file can stay
// minimal and so non-route imports of `auth`/`signIn`/`signOut` don't
// drag the handlers into edge bundles.

import { handlers } from "@/auth";

export const { GET, POST } = handlers;
