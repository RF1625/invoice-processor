import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { validateRequestOrigin } from "@/lib/auth";

const canManageApprovals = (role: string | null | undefined) => role === "owner" || role === "admin";

const parseOptionalDate = (raw: unknown) => {
  const value = (raw ?? "").toString().trim();
  if (!value) return null;
  // Avoid timezone surprises when client sends YYYY-MM-DD.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
};

const parseOptionalDecimal = (raw: unknown) => {
  if (raw === null || raw === undefined || raw === "") return null;
  if (raw instanceof Prisma.Decimal) return raw;
  if (typeof raw === "number") return new Prisma.Decimal(raw);
  const s = raw.toString().trim();
  if (!s) return null;
  return new Prisma.Decimal(s);
};

export async function PUT(req: NextRequest, context: { params: Promise<{ userId: string }> }) {
  try {
    const originCheck = validateRequestOrigin(req);
    if (!originCheck.ok) return NextResponse.json({ error: originCheck.error }, { status: 403 });

    const session = await requireSession();
    const firmId = session.firmId;

    const membership = await prisma.firmMembership.findUnique({
      where: { firmId_userId: { firmId, userId: session.userId } },
      select: { role: true },
    });
    if (!membership || !canManageApprovals(membership.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const params = await context.params;
    const userId = params.userId;

    const targetMembership = await prisma.firmMembership.findUnique({
      where: { firmId_userId: { firmId, userId } },
      select: { userId: true },
    });
    if (!targetMembership) return NextResponse.json({ error: "User is not in this firm" }, { status: 400 });

    const body = await req.json();
    const approverUserId: string | null = body.approverUserId ?? null;
    const substituteUserId: string | null = body.substituteUserId ?? null;
    const substituteFrom = parseOptionalDate(body.substituteFrom);
    const substituteTo = parseOptionalDate(body.substituteTo);
    const approvalLimit = parseOptionalDecimal(body.approvalLimit);
    const active = body.active == null ? true : Boolean(body.active);

    if (approverUserId) {
      const approverMembership = await prisma.firmMembership.findUnique({
        where: { firmId_userId: { firmId, userId: approverUserId } },
        select: { userId: true },
      });
      if (!approverMembership) {
        return NextResponse.json({ error: "Approver must be a firm member" }, { status: 400 });
      }
    }

    if (substituteUserId) {
      const substituteMembership = await prisma.firmMembership.findUnique({
        where: { firmId_userId: { firmId, userId: substituteUserId } },
        select: { userId: true },
      });
      if (!substituteMembership) {
        return NextResponse.json({ error: "Substitute must be a firm member" }, { status: 400 });
      }
    }

    const setup = await prisma.approvalUserSetup.upsert({
      where: { firmId_userId: { firmId, userId } },
      create: {
        firmId,
        userId,
        approverUserId,
        substituteUserId,
        substituteFrom,
        substituteTo,
        approvalLimit,
        active,
      },
      update: {
        approverUserId,
        substituteUserId,
        substituteFrom,
        substituteTo,
        approvalLimit,
        active,
      },
    });

    return NextResponse.json({ setup }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save approval setup";
    const status = message.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
