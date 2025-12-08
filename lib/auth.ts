import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { prisma } from "./prisma";

export const SESSION_COOKIE_NAME = "session_token";
const SESSION_TTL_DAYS = 30;

export const hashPassword = async (password: string) => bcrypt.hash(password, 10);
export const verifyPassword = async (password: string, hash: string) => bcrypt.compare(password, hash);

export async function createSession(userId: string, firmId: string) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      userId,
      firmId,
      token,
      expiresAt,
    },
  });

  return { token, expiresAt };
}

export function buildSessionCookie(token: string, expiresAt: Date) {
  return {
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  };
}

export async function getSessionFromCookies() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const token =
    typeof (cookieStore as unknown as { get?: unknown }).get === "function"
      ? (cookieStore as unknown as { get: (name: string) => { value?: string } | undefined }).get(SESSION_COOKIE_NAME)
          ?.value
      : parseCookieHeader(headerStore.get("cookie") ?? "")[SESSION_COOKIE_NAME];
  if (!token) return null;

  const session = await prisma.session.findFirst({
    where: {
      token,
      expiresAt: { gt: new Date() },
    },
    include: {
      user: true,
      firm: true,
    },
  });

  return session;
}

const parseCookieHeader = (raw: string) =>
  raw.split(";").reduce<Record<string, string>>((acc, part) => {
    const [k, v] = part.split("=").map((s) => s.trim());
    if (k) acc[k] = decodeURIComponent(v ?? "");
    return acc;
  }, {});
