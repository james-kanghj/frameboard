// /apps/web/next.config.ts

import type { NextConfig } from "next";

// Cloudflare Pages 'next-on-pages' adapter needs dynamic routes to opt
// into the edge runtime; that's wired per-route via `export const runtime =
// "edge"` in each page rather than globally here. Static routes stay on the
// default runtime where they're cheaper to serve.
//
// setupDevPlatform() wires Cloudflare's local bindings (KV, R2, D1, etc.)
// into `next dev` so dev matches Pages. We don't use any bindings yet so
// it's effectively a no-op, but having it in place means adding one later
// won't require a config change.
//
// We avoid top-level await because Next's TS-config loader transpiles this
// file to CommonJS, where TLA is invalid syntax. Calling it inside an IIFE
// keeps the call site sync from the transpiler's perspective.
if (process.env.NODE_ENV === "development") {
  void (async () => {
    const { setupDevPlatform } = await import(
      "@cloudflare/next-on-pages/next-dev"
    );
    await setupDevPlatform();
  })();
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@frameboard/shared"],
  env: {
    NEXT_PUBLIC_APP_NAME: "Frameboard",
  },
};

export default nextConfig;