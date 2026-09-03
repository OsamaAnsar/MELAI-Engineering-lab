import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@melai/ai-core", "@melai/shared"],
};

export default nextConfig;
