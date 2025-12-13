import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";

const canManageApprovals = (role: string | null | undefined) => role === "owner" || role === "admin";

export async function GET(_req: NextRequest) {
  try {
    const session = await requireSession();
    const firmId = session.firmId;

    const membership = await prisma.firmMembership.findUnique({
      where: { firmId_userId: { firmId, userId: session.userId } },
      select: { role: true },
    });
    if (!membership || !canManageApprovals(membership.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const memberships = await prisma.firmMembership.findMany({
      where: { firmId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            approvalSetups: {
              where: { firmId },
              select: {
                userId: true,
                approverUserId: true,
                approvalLimit: true,
                substituteUserId: true,
                substituteFrom: true,
                substituteTo: true,
                active: true,
              },
            },
          },
        },
      },
      orderBy: [{ createdAt: "asc" }],
    });

    const users = memberships.map((m) => ({
      userId: m.userId,
      role: m.role,
      email: m.user.email,
      name: m.user.name,
      setup: m.user.approvalSetups[0] ?? null,
    }));

    return NextResponse.json({ users }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load approval setups";
    const status = message.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
