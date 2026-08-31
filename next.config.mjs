/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // Next.js defaults Server Actions to a 1MB request body, which any
      // real photo or video blows straight through (that's what caused the
      // "page couldn't load" / unexpected response error on upload).
      // Set with headroom above the app's own 50MB video limit in
      // src/lib/actions/media.ts (the larger of the two caps), plus
      // overhead multipart/form-data adds.
      bodySizeLimit: "60mb",
    },
  },
  // `ws` (used by src/lib/db.ts's Neon serverless driver adapter,
  // 2026-09-01) ships optional native addons — bufferutil,
  // utf-8-validate — for faster WebSocket framing. Left out of Next's
  // own bundling and required normally from node_modules at runtime
  // instead, which is what those addons need to actually load; bundling
  // `ws` is a known, documented source of "bufferUtil.mask is not a
  // function" errors in serverless Next.js deployments otherwise.
  serverExternalPackages: ["ws"],
};

export default nextConfig;
