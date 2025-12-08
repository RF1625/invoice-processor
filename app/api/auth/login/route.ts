import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildSessionCookie, createSession, verifyPassword } from "@/lib/auth";
import { getDefaultFirmId } from "@/lib/tenant";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = (body.email ?? "").toString().trim().toLowerCase();
    const password = (body.password ?? "").toString();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        memberships: { include: { firm: true } },
        defaultFirm: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const preferredFirmId =
      user.defaultFirmId ??
      user.memberships.find((m) => m.firmId === user.defaultFirmId)?.firmId ??
      user.memberships[0]?.firmId ??
      (await getDefaultFirmId());

    if (!preferredFirmId) {
      return NextResponse.json({ error: "No firm available for this user" }, { status: 400 });
    }

    const { token, expiresAt } = await createSession(user.id, preferredFirmId);
    const firm =
      user.memberships.find((m) => m.firmId === preferredFirmId)?.firm ??
      user.defaultFirm ??
      null;

    const res = NextResponse.json(
      {
        user: { id: user.id, email: user.email, name: user.name },
        firm: firm ? { id: firm.id, name: firm.name, code: firm.code } : { id: preferredFirmId },
      },
      { status: 200 },
    );
    res.cookies.set(buildSessionCookie(token, expiresAt));
    return res;
  } catch (err) {
    console.error("Login failed", err);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
