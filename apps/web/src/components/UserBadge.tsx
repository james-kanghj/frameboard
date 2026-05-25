// Server-component wrapper that reads the NextAuth session once per
// request and hands the user object off to the client-side menu. Splits
// auth-read (server) from dropdown UI (client) so we don't pay the
// SessionProvider tax on every page that mounts the layout.

import { auth } from "@/auth";

import { UserBadgeMenu } from "./UserBadgeMenu";

export async function UserBadge() {
  // A stale or wrong-secret cookie can make Auth.js throw inside auth().
  // Treat any decode failure as "no session" — the badge just disappears
  // and the user can re-sign-in.
  let session = null;
  try {
    session = await auth();
  } catch {
    session = null;
  }
  if (!session?.user?.email) return null;

  const { name, email, image } = session.user;
  return (
    <UserBadgeMenu
      name={name ?? email}
      email={email}
      image={image ?? null}
    />
  );
}
