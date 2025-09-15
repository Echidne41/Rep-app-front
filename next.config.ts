import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  // safety net if TS complains during build:
  // typescript: { ignoreBuildErrors: true },
};
export default nextConfig;
