import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transfers must reach the browser without compression or response caching.
  compress: false,
  poweredByHeader: false,
};

export default nextConfig;
