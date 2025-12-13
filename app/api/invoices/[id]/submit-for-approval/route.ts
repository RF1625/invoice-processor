import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { validateRequestOrigin } from "@/lib/auth";
import { ensureActiveInvoiceApprovalPlan, ApprovalEngineError } from "@/lib/approvalEngine";
import { Prisma } from "@prisma/client";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const originCheck = validateRequestOrigin(req);
    if (!originCheck.ok) {
      return NextResponse.json({ error: originCheck.error }, { status: 403 });
    }

    const params = await context.params;
    const session = await requireSession();
    const firmId = session.firmId;
    const requesterUserId = session.userId;

    const invoice = await prisma.invoice.findFirst({
      where: { id: params.id, firmId },
      include: { vendor: true, approvals: { orderBy: { createdAt: "desc" } } },
    });
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    if (invoice.status === "needs_review") {
      return NextResponse.json({ error: "Invoice needs review before approval submission" }, { status: 400 });
    }

    const policy = invoice.recommendedApprovalPolicy ?? invoice.vendor?.defaultApprovalPolicy ?? "manager";

    if (policy === "none") {
      const outcome = await prisma.$transaction(async (tx) => {
        const amount = invoice.totalAmount instanceof Prisma.Decimal ? invoice.totalAmount : new Prisma.Decimal(invoice.totalAmount as any);

        const plan = await tx.invoiceApprovalPlan.create({
          data: {
            firmId,
            invoiceId: invoice.id,
            requesterUserId,
            status: "completed",
            completedAt: new Date(),
            scopes: {
              create: {
                firmId,
                invoiceId: invoice.id,
                scopeType: "invoice_total",
                scopeKey: null,
                amount,
                currencyCode: invoice.currencyCode ?? null,
                status: "completed",
                completedAt: new Date(),
                steps: { create: [] },
              },
            },
          },
        });

        const updatedInvoice = await tx.invoice.update({
          where: { id: invoice.id },
          data: { status: "approved" },
        });

        await tx.invoiceApproval.create({
          data: {
            firmId,
            invoiceId: invoice.id,
            userId: requesterUserId,
            status: "approved",
            comment: "Auto-approved (policy: none)",
            actedAt: new Date(),
          },
        });

        return { invoice: updatedInvoice, planId: plan.id };
      });

      return NextResponse.json({ invoice: outcome.invoice, planId: outcome.planId, policy }, { status: 201 });
    }

    const plan = await prisma.$transaction((tx) =>
      ensureActiveInvoiceApprovalPlan(tx, { firmId, invoiceId: invoice.id, requesterUserId }),
    );
    const refreshed = await prisma.invoice.findFirst({
      where: { id: invoice.id, firmId },
      include: { approvals: { orderBy: { createdAt: "desc" } } },
    });
    return NextResponse.json({ invoice: refreshed, plan, policy }, { status: 201 });
  } catch (err) {
    if (err instanceof ApprovalEngineError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error("Failed to submit invoice for approval", err);
    const message = err instanceof Error ? err.message : "Failed to submit invoice for approval";
    const status = message.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

