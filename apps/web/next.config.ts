import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits a self-contained server bundle with only the needed node_modules,
  // which is what the Docker image copies. Harmless outside Docker.
  output: "standalone",
  // In a pnpm workspace the tracing root is the repo root, not apps/web.
  outputFileTracingRoot: __dirname + "/../..",
};

export default nextConfig;
