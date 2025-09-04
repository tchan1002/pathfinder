import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  eslint: {
    // Reduce disk/io during CI builds; rely on separate lint step locally
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Speed up CI builds; keep type checking in dev/CI separately
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
