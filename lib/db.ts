import { Pool, type PoolClient, type PoolConfig } from "pg";

let pool: Pool | null = null;

const createPool = () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const config: PoolConfig = { connectionString };

  // Support SSL when available (e.g., Azure Database for PostgreSQL)
  if (process.env.PGSSL === "true") {
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
