#!/usr/bin/env node
/* Simple migration runner for db/migrations/*.sql */
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: ".env.local" });
require("dotenv").config(); // fallback to .env if .env.local missing
const { Pool } = require("pg");

const migrationsDir = path.join(process.cwd(), "db", "migrations");

async function main() {
  const { DATABASE_URL, PGSSL } = process.env;
  if (!DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
  });

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.log("No migrations found.");
    process.exit(0);
  }

  const client = await pool.connect();
  try {
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      console.log(`Running migration: ${file}`);
      await client.query(sql);
    }
    console.log("Migrations completed.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Migration failed", err);
  process.exit(1);
});
