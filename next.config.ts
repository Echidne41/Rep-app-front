import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  // Optional: uncomment if TS errors block the build
  // typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
