import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME, validateRequestOrigin } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const originCheck = validateRequestOrigin(req);
    if (!originCheck.ok) {
      return NextResponse.json({ error: originCheck.error }, { status: 403 });
    }

    const token =
      req.cookies.get(SESSION_COOKIE_NAME)?.value ??
      (req.headers.get("cookie") ?? "")
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))
        ?.split("=")[1];

    if (token) {
      await prisma.session.deleteMany({ where: { token } });
    }

    const res = NextResponse.json({ ok: true }, { status: 200 });
    res.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: "",
      path: "/",
      httpOnly: true,
      expires: new Date(0),
    });
    return res;
  } catch (err) {
    console.error("Logout failed", err);
    return NextResponse.json({ error: "Logout failed" }, { status: 500 });
  }
}
