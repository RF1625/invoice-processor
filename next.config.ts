import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Externalize heavy node-only deps so Turbopack/Webpack don't try to parse their test/bench files.
  serverExternalPackages: ["imapflow", "pino", "thread-stream", "sonic-boom"],
  // Ensure Prisma client + engines (custom output path) are traced into the serverless bundle.
  outputFileTracingIncludes: {
    "*": ["./lib/generated/prisma/**", "./node_modules/.prisma/client/**"],
  },
};

export default nextConfig;
