import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The floating dev badge is noise in demo screenshots and the walkthrough
  // video; real errors are still surfaced by the dev server.
  devIndicators: false,
  experimental: {
    serverActions: {
      // CSV uploads travel through a server action; the 1 MB default is too
      // small. 12 MB covers the 10 MB file cap plus multipart overhead.
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
