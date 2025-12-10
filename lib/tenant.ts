import { prisma } from "./prisma";
import { getSessionFromCookies } from "./auth";

let defaultFirmIdCache: string | null = null;

export async function getDefaultFirmId() {
  if (defaultFirmIdCache) return defaultFirmIdCache;
  try {
    const firm = await prisma.firm.findFirst({ where: { code: "default" } });
    defaultFirmIdCache = firm?.id ?? null;
    return defaultFirmIdCache;
  } catch (err) {
    // Table may not exist yet; treat as no default firm rather than hard error
    if ((err as { code?: string }).code === "P2021") {
      return null;
    }
    throw err;
  }
}

export async function resolveFirmId() {
  const session = await getSessionFromCookies();
  if (session?.firmId) return session.firmId;
  return null;
}

export async function requireFirmId() {
  const session = await getSessionFromCookies();
  if (!session?.firmId) {
    throw new Error("Unauthorized");
  }
  return session.firmId;
}

export async function requireSession() {
  const session = await getSessionFromCookies();
  if (!session) {
    throw new Error("Unauthorized");
  }
  return session;
}
