#!/usr/bin/env node
/* Backfill local invoice PDFs into Supabase Storage. */
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();
const { Client } = require("pg");
const { createClient } = require("@supabase/supabase-js");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitArg = args.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : null;

const {
  DATABASE_URL,
  PGSSL,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_STORAGE_BUCKET,
  STORAGE_ROOT,
  VERCEL,
} = process.env;

if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  process.exit(1);
}

const storageBucket = SUPABASE_STORAGE_BUCKET || "invoices";
const defaultStorageRoot = VERCEL ? "/tmp/invoice-processor" : path.join(process.cwd(), "storage");
const storageRoot = STORAGE_ROOT || defaultStorageRoot;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const toSafePath = (value) => value.replace(/^\/+/, "");

const isAlreadyExistsError = (error) => {
  if (!error) return false;
  if (error.statusCode === 409) return true;
  const message = `${error.message || ""}`.toLowerCase();
  return message.includes("already exists") || message.includes("duplicate");
};

async function main() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
  });

  await client.connect();
  const limitSql = Number.isFinite(limit) && limit > 0 ? ` limit ${Math.floor(limit)}` : "";
  const res = await client.query(
    `select id, storage_path, file_name, content_type, size_bytes from files where storage_path is not null order by created_at desc${limitSql}`,
  );

  let uploaded = 0;
  let skipped = 0;
  let missing = 0;
  let failed = 0;

  for (const row of res.rows) {
    if (!row.storage_path) continue;
    const safePath = toSafePath(row.storage_path);
    const localPath = path.join(storageRoot, safePath);

    if (!fs.existsSync(localPath)) {
      missing += 1;
      console.warn(`Missing local file for ${safePath}`);
      continue;
    }

    if (dryRun) {
      skipped += 1;
      console.log(`[dry-run] Would upload ${safePath}`);
      continue;
    }

    try {
      const buffer = await fsp.readFile(localPath);
      const { error } = await supabase.storage.from(storageBucket).upload(safePath, buffer, {
        contentType: row.content_type || "application/pdf",
        upsert: false,
      });

      if (isAlreadyExistsError(error)) {
        skipped += 1;
        console.log(`Already in storage: ${safePath}`);
        continue;
      }

      if (error) {
        failed += 1;
        console.error(`Failed to upload ${safePath}: ${error.message}`);
        continue;
      }

      uploaded += 1;
      console.log(`Uploaded ${safePath}`);
    } catch (err) {
      failed += 1;
      console.error(`Failed to upload ${safePath}: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  await client.end();
  console.log(
    `Done. uploaded=${uploaded} skipped=${skipped} missing=${missing} failed=${failed} total=${res.rows.length}`,
  );
}

main().catch((err) => {
  console.error("Backfill failed", err);
  process.exit(1);
});
