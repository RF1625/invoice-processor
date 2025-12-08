#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const { spawnSync } = require("child_process");

const env = { ...process.env };
if (!env.DATABASE_URL) {
  env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
}

const result = spawnSync("npx", ["prisma", "generate"], {
  stdio: "inherit",
  env,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
