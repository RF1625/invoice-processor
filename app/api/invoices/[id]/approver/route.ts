import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { validateRequestOrigin } from "@/lib/auth";

const canManageApprovals = (role: string | null | undefined) => role === "owner" || role === "admin";

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const originCheck = validateRequestOrigin(req);
    if (!originCheck.ok) {
      return NextResponse.json({ error: originCheck.error }, { status: 403 });
    }

    const params = await context.params;
    const session = await requireSession();
    const firmId = session.firmId;

    const membership = await prisma.firmMembership.findUnique({
      where: { firmId_userId: { firmId, userId: session.userId } },
      select: { role: true },
    });
    if (!membership || !canManageApprovals(membership.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const rawApprover = body.approverUserId;
    const approverUserId = typeof rawApprover === "string" && rawApprover.trim() ? rawApprover : null;

    const invoice = await prisma.invoice.findFirst({ where: { id: params.id, firmId } });
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

    const activePlan = await prisma.invoiceApprovalPlan.findFirst({
      where: { firmId, invoiceId: invoice.id, status: "active" },
      select: { id: true },
    });
    if (activePlan) {
      return NextResponse.json({ error: "Cannot change approver while approval is pending" }, { status: 400 });
    }

    if (approverUserId) {
      const approverSetup = await prisma.approvalUserSetup.findUnique({
        where: { firmId_userId: { firmId, userId: approverUserId } },
        select: { active: true },
      });
      if (!approverSetup) {
        return NextResponse.json({ error: "Approver is missing approval setup" }, { status: 400 });
      }
      if (!approverSetup.active) {
        return NextResponse.json({ error: "Approver is not active for approvals" }, { status: 400 });
      }
    }

    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: { approvalApproverId: approverUserId },
      include: { approvalApprover: { select: { id: true, name: true, email: true } } },
    });

    return NextResponse.json({ invoice: updated }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update invoice approver";
    const status = message.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
