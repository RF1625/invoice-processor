#!/usr/bin/env node
/* Simple migration runner for db/migrations/*.sql */
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: ".env.local" });
require("dotenv").config(); // fallback to .env if .env.local missing
const { Pool } = require("pg");

const migrationsDir = path.join(process.cwd(), "db", "migrations");

const shouldRunInTransaction = (sql) => {
  // Postgres does not allow ALTER TYPE ... ADD VALUE inside an explicit transaction block,
  // and PgBouncer/Supabase poolers can disconnect on such DDL even if it succeeds.
  if (/ALTER\s+TYPE\s+[\w".]+\s+ADD\s+VALUE/i.test(sql)) return false;
  return true;
};

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

  // Avoid crashing on transient/idle client errors (common with poolers) after work is done.
  let shuttingDown = false;
  pool.on("error", (err) => {
    if (shuttingDown) return;
    console.error("Postgres pool error", err);
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
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const appliedRes = await client.query("SELECT id FROM schema_migrations");
    const applied = new Set(appliedRes.rows.map((r) => r.id));

    const pending = files.filter((file) => !applied.has(file));
    if (pending.length === 0) {
      console.log("No pending migrations.");
      return;
    }

    for (const file of pending) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      console.log(`Running migration: ${file}`);
      const useTransaction = shouldRunInTransaction(sql);
      if (useTransaction) {
        await client.query("BEGIN");
        try {
          await client.query(sql);
          await client.query("INSERT INTO schema_migrations (id, applied_at) VALUES ($1, NOW())", [file]);
          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        }
      } else {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (id, applied_at) VALUES ($1, NOW())", [file]);
      }
    }
    console.log("Migrations completed.");
  } finally {
    client.release();
    shuttingDown = true;
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Migration failed", err);
  process.exit(1);
});
