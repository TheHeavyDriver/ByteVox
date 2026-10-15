import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // CSV uploads travel through a server action; the 1 MB default is too
      // small. 12 MB covers the 10 MB file cap plus multipart overhead.
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
