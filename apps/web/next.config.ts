import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.resolve(import.meta.dirname, "../.."),
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["drizzle-orm", "postgres", "ioredis", "pino"],
  transpilePackages: ["@wakil/ui"],
};

export default nextConfig;
