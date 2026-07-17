import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["drizzle-orm", "postgres", "ioredis"],
  transpilePackages: ["@wakil/ui"],
};

export default nextConfig;
