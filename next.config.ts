import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // WHY: E2E's isolated output avoids colliding with a developer's existing Next.js server/cache.
  ...(process.env.TAPUP_E2E === "1" ? { distDir: ".next-e2e" } : {}),
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
