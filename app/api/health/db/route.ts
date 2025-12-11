import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const revalidate = 0;

export async function GET() {
  try {
    const [{ now }] = await prisma.$queryRaw<{ now: Date }[]>`select now()`;
    return NextResponse.json({ ok: true, now, databaseUrlPresent: Boolean(process.env.DATABASE_URL) });
  } catch (err) {
    console.error("DB health check failed", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
        databaseUrlPresent: Boolean(process.env.DATABASE_URL),
      },
      { status: 500 },
    );
  }
}
