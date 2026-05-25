// /apps/web/next.config.ts

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@frameboard/shared"],
  env: {
    NEXT_PUBLIC_APP_NAME: "Frameboard",
  },
};

export default nextConfig;
