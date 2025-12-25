import { Pool, type PoolClient, type PoolConfig } from "pg";

let pool: Pool | null = null;

const stripSslParams = (value: string) => {
  try {
    const url = new URL(value);
    url.searchParams.delete("sslmode");
    url.searchParams.delete("ssl");
    return url.toString();
  } catch {
    return value;
  }
};

const createPool = () => {
  const rawConnectionString = process.env.DATABASE_URL;
  if (!rawConnectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const sslModeFromUrl = (() => {
    try {
      return new URL(rawConnectionString).searchParams.get("sslmode")?.toLowerCase() ?? "";
    } catch {
      return "";
    }
  })();

  const pgssl = (process.env.PGSSL ?? "").toLowerCase();
  const sslMode = (process.env.PGSSLMODE ?? "").toLowerCase();
  const sslExplicitlyDisabled = pgssl === "false" || sslMode === "disable";
  const sslExplicitlyEnabled =
    pgssl === "true" ||
    sslMode === "require" ||
    sslMode === "verify-ca" ||
    sslMode === "verify-full" ||
    sslMode === "prefer" ||
    sslMode === "no-verify";
  const sslFromUrlEnabled =
    /[?&]sslmode=(require|verify-full|verify-ca|prefer|no-verify)/i.test(rawConnectionString) ||
    /[?&]ssl=true/i.test(rawConnectionString);
  const sslFromUrlDisabled =
    /[?&]sslmode=disable/i.test(rawConnectionString) || /[?&]ssl=false/i.test(rawConnectionString);
  const shouldUseSsl = sslExplicitlyDisabled ? false : sslExplicitlyEnabled ? true : sslFromUrlDisabled ? false : sslFromUrlEnabled;
  const allowSelfSigned =
    process.env.PGSSL_ALLOW_SELF_SIGNED === "true" ||
    sslMode === "no-verify" ||
    sslModeFromUrl === "no-verify" ||
    process.env.NODE_ENV !== "production";

  const connectionString = stripSslParams(rawConnectionString);
  const config: PoolConfig = {
    connectionString,
    ssl: shouldUseSsl ? { rejectUnauthorized: !allowSelfSigned } : false,
  };

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
