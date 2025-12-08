import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildSessionCookie, createSession, hashPassword } from "@/lib/auth";

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 40) || "firm";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = (body.email ?? "").toString().trim().toLowerCase();
    const password = (body.password ?? "").toString();
    const name = (body.name ?? "").toString().trim();
    const firmName = (body.firmName ?? "").toString().trim();

    if (!email || !password || !firmName) {
      return NextResponse.json({ error: "Email, password, and company name are required" }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);

    // Try a few firm codes until we find a unique one
    const baseCode = slugify(firmName);
    let firmCode = baseCode;
    let attempts = 0;
    while (attempts < 3) {
      const existingFirm = await prisma.firm.findUnique({ where: { code: firmCode } });
      if (!existingFirm) break;
      attempts += 1;
      firmCode = `${baseCode}-${Math.random().toString(36).slice(2, 6)}`;
    }

    const { firm, user } = await prisma.$transaction(async (tx) => {
      const createdFirm = await tx.firm.create({
        data: {
          name: firmName,
          code: firmCode,
        },
      });

      const createdUser = await tx.user.create({
        data: {
          email,
          name: name || null,
          passwordHash,
          defaultFirmId: createdFirm.id,
        },
      });

      await tx.firmMembership.create({
        data: {
          firmId: createdFirm.id,
          userId: createdUser.id,
          role: "owner",
        },
      });

      return { firm: createdFirm, user: createdUser };
    });

    const { token, expiresAt } = await createSession(user.id, firm.id);
    const res = NextResponse.json(
      {
        user: { id: user.id, email: user.email, name: user.name },
        firm: { id: firm.id, name: firm.name, code: firm.code },
      },
      { status: 201 },
    );
    res.cookies.set(buildSessionCookie(token, expiresAt));
    return res;
  } catch (err) {
    console.error("Signup failed", err);
    return NextResponse.json({ error: "Sign up failed" }, { status: 500 });
  }
}
