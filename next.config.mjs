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
};

export default nextConfig;
