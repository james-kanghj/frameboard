// /apps/web/src/auth.ts
//
// NextAuth v5 (Auth.js) configuration. Session strategy is JWT; the
// cookie is signed with HS256 using NEXTAUTH_SECRET so the FastAPI
// backend can verify the same token via PyJWT (`Authorization: Bearer
// <token>`). GitHub is the only provider for now - Google can be
// added by appending to the providers array.
//
// AUTH_DISABLED bypass: when NEXT_PUBLIC_AUTH_DISABLED=1 the
// middleware short-circuits and pages fall back to the DEV_USER_EMAIL.
// This mirrors the backend's AUTH_DISABLED so contributors can run the
// whole stack without registering an OAuth app.

import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { SignJWT, jwtVerify } from "jose";

const encoder = new TextEncoder();

function secretKey(): Uint8Array {
  const raw = process.env.NEXTAUTH_SECRET;
  if (!raw) {
    throw new Error(
      "NEXTAUTH_SECRET is not set - required for session JWT signing",
    );
  }
  return encoder.encode(raw);
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
      // Lower-case the email server-side so the backend's email key
      // matches exactly regardless of provider casing quirks.
      profile(profile) {
        return {
          id: String(profile.id),
          name: profile.name ?? profile.login,
          email: (profile.email ?? "").toLowerCase() || undefined,
          image: profile.avatar_url,
        };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/auth/signin" },
  // Override NextAuth's default JWE encoding so the cookie is a plain
  // HS256 JWT - that's what PyJWT on the backend expects. The same
  // function decodes incoming requests, so middleware + auth() both
  // continue to work.
  jwt: {
    async encode({ token }) {
      if (!token) throw new Error("encode called without token");
      return await new SignJWT(token as Record<string, unknown>)
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("30d")
        .sign(secretKey());
    },
    async decode({ token }) {
      if (!token) return null;
      try {
        const { payload } = await jwtVerify(token, secretKey(), {
          algorithms: ["HS256"],
        });
        return payload as Record<string, unknown>;
      } catch {
        return null;
      }
    },
  },
  callbacks: {
    // First sign-in: profile carries email/name; lift them into the
    // token so the session callback (and the backend) see them.
    async jwt({ token, profile }) {
      if (profile) {
        if (profile.email) token.email = profile.email;
        if (profile.name) token.name = profile.name;
      }
      return token;
    },
  },
  logger: {
    // Auth.js logs JWTSessionError to console BEFORE throwing. A user
    // landing with a cookie signed by a previous NEXTAUTH_SECRET (or
    // NextAuth's default JWE before the HS256 swap) is an expected,
    // self-healing condition - we already catch the throw at the
    // `auth()` callsites. Suppress the noisy console.error so it
    // doesn't trigger the dev overlay; keep real errors visible.
    error(error) {
      if (error?.name === "JWTSessionError") return;
      console.error(error);
    },
  },
});
