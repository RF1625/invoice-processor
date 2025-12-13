import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { validateRequestOrigin } from "@/lib/auth";
import { actOnInvoiceApproval, ApprovalEngineError, ensureActiveInvoiceApprovalPlan } from "@/lib/approvalEngine";

const normalizeStatus = (raw: unknown) => {
  const value = (raw ?? "").toString().toLowerCase();
  if (value === "approved" || value === "approve") return "approved";
  if (value === "rejected" || value === "reject") return "rejected";
  return "pending";
};

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const originCheck = validateRequestOrigin(req);
    if (!originCheck.ok) {
      return NextResponse.json({ error: originCheck.error }, { status: 403 });
    }

    const params = await context.params;
    const session = await requireSession();
    const firmId = session.firmId;
    const actorUserId = session.userId;
    const body = await req.json();
    const comment: string | null = body.comment ?? null;
    const status = normalizeStatus(body.status);

    const invoice = await prisma.invoice.findFirst({ where: { id: params.id, firmId } });
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

    if (status === "pending") {
      const plan = await prisma.$transaction((tx) =>
        ensureActiveInvoiceApprovalPlan(tx, { firmId, invoiceId: invoice.id, requesterUserId: actorUserId }),
      );
      const refreshed = await prisma.invoice.findFirst({
        where: { id: invoice.id, firmId },
        include: { approvals: { orderBy: { createdAt: "desc" } } },
      });
      return NextResponse.json({ plan, invoice: refreshed }, { status: 201 });
    }

    const action = status === "approved" ? "approve" : "reject";
    const scopeId: string | null = body.scopeId ?? null;
    const outcome = await prisma.$transaction((tx) =>
      actOnInvoiceApproval(tx, { firmId, invoiceId: invoice.id, actorUserId, action, comment, scopeId }),
    );
    const refreshed = await prisma.invoice.findFirst({
      where: { id: invoice.id, firmId },
      include: { approvals: { orderBy: { createdAt: "desc" } } },
    });
    return NextResponse.json({ outcome, invoice: refreshed }, { status: 201 });
  } catch (err) {
    if (err instanceof ApprovalEngineError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error("Failed to record approval", err);
    const message = err instanceof Error ? err.message : "Failed to record approval";
    const status = message.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
