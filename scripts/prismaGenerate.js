#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const env = { ...process.env };
const nodeMajor = Number(process.versions.node.split(".")[0]);
const requireModuleFlag = "--experimental-require-module";
if (nodeMajor >= 22) {
  const nodeOptions = env.NODE_OPTIONS ? env.NODE_OPTIONS.split(" ") : [];
  if (!nodeOptions.includes(requireModuleFlag)) {
    env.NODE_OPTIONS = env.NODE_OPTIONS ? `${env.NODE_OPTIONS} ${requireModuleFlag}` : requireModuleFlag;
  }
}

const loadEnvFile = (file) => {
  const fullPath = path.join(process.cwd(), file);
  if (!fs.existsSync(fullPath)) return;
  const content = fs.readFileSync(fullPath, "utf8");
  content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .forEach((line) => {
      const idx = line.indexOf("=");
      if (idx === -1) return;
      const key = line.slice(0, idx).trim();
      const raw = line.slice(idx + 1);
      if (!key || env[key] !== undefined) return;
      const value = raw.replace(/^['"]|['"]$/g, "");
      env[key] = value;
    });
};

// Prefer .env.local for secrets, fall back to .env.
loadEnvFile(".env.local");
loadEnvFile(".env");

if (!env.DATABASE_URL) {
  // Provide a safe fallback so local builds don't fail; prisma generate doesn't hit the DB.
  env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/postgres?sslmode=disable";
  console.warn("DATABASE_URL not set; using local fallback for prisma generate.");
}

const result = spawnSync("npx", ["prisma", "generate"], {
  stdio: "inherit",
  env,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
