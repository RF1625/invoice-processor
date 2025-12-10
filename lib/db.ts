import { Pool, type PoolClient, type PoolConfig } from "pg";

let pool: Pool | null = null;

const createPool = () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const config: PoolConfig = { connectionString };

  // Enable SSL when explicitly requested or implied by the connection string (e.g., sslmode=require for Supabase)
  let sslFromUrl = false;
  try {
    const url = new URL(connectionString);
    const sslMode = url.searchParams.get("sslmode")?.toLowerCase();
    const sslFlag = url.searchParams.get("ssl")?.toLowerCase();
    sslFromUrl =
      sslFlag === "true" ||
      sslMode === "require" ||
      sslMode === "prefer" ||
      sslMode === "verify-ca" ||
      sslMode === "verify-full";
  } catch {
    // Ignore malformed URL; fall back to env flag.
  }

  if (process.env.PGSSL === "true" || sslFromUrl) {
    config.ssl = { rejectUnauthorized: false };
  }

  return new Pool(config);
};

export const getPool = () => {
  if (!pool) {
    pool = createPool();
  }
  return pool;
};

export async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const p = getPool();
  const client = await p.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
