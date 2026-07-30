/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // Next.js defaults Server Actions to a 1MB request body, which any
      // real photo blows straight through (that's what caused the "page
      // couldn't load" / unexpected response error on image upload).
      // Set with headroom above the app's own 15MB image limit in
      // src/lib/actions/media.ts, plus overhead multipart/form-data adds.
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
