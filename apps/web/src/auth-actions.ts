// /apps/web/src/auth-actions.ts
//
// Server Actions extracted from the sign-in page. Defining them in a
// module marked "use server" (instead of inline inside the page
// component) avoids a Server Components render failure on Cloudflare
// Workers / next-on-pages: the inline closure version captured
// `callbackUrl` from `searchParams` and tripped the runtime's stricter
// serialisation check, surfacing as the generic "An error occurred in
// the Server Components render" digest. Reading the callback off
// FormData keeps the action pure.

"use server";

import { signIn } from "@/auth";

export async function signInWithGitHub(formData: FormData) {
  const raw = formData.get("callbackUrl");
  const callbackUrl = typeof raw === "string" && raw.startsWith("/")
    ? raw
    : "/workspaces";
  await signIn("github", { redirectTo: callbackUrl });
}
