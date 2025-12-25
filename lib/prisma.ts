import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; prismaAdapter?: PrismaPg };

const rawConnectionString = process.env.DATABASE_URL;
if (!rawConnectionString) {
  throw new Error("DATABASE_URL is required to initialize Prisma Client");
}

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
const sslFromUrlDisabled = /[?&]sslmode=disable/i.test(rawConnectionString) || /[?&]ssl=false/i.test(rawConnectionString);
const shouldUseSsl = sslExplicitlyDisabled ? false : sslExplicitlyEnabled ? true : sslFromUrlDisabled ? false : sslFromUrlEnabled;
const allowSelfSigned =
  process.env.PGSSL_ALLOW_SELF_SIGNED === "true" ||
  sslMode === "no-verify" ||
  sslModeFromUrl === "no-verify" ||
  process.env.NODE_ENV !== "production";
// pg parses sslmode from the URL and overwrites explicit ssl settings; strip it so our config applies.
const connectionString = stripSslParams(rawConnectionString);
const ssl = shouldUseSsl ? { rejectUnauthorized: !allowSelfSigned } : false;
const adapter = globalForPrisma.prismaAdapter ?? new PrismaPg({ connectionString, ssl });

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.PRISMA_LOG_QUERIES === "true" ? ["query", "error", "warn"] : ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaAdapter = adapter;
}
