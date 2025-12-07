import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Externalize heavy node-only deps so Turbopack/Webpack don't try to parse their test/bench files.
  serverExternalPackages: ["imapflow", "pino", "thread-stream", "sonic-boom"],
};

export default nextConfig;
