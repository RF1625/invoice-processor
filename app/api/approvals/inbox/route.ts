import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { validateRequestOrigin } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const originCheck = validateRequestOrigin(req);
    if (!originCheck.ok) {
      return NextResponse.json({ error: originCheck.error }, { status: 403 });
    }

    const session = await requireSession();
    const firmId = session.firmId;
    const userId = session.userId;
    const now = new Date();

    const substituteFor = await prisma.approvalUserSetup.findMany({
      where: {
        firmId,
        active: true,
        substituteUserId: userId,
        AND: [
          { OR: [{ substituteFrom: null }, { substituteFrom: { lte: now } }] },
          { OR: [{ substituteTo: null }, { substituteTo: { gte: now } }] },
        ],
      },
      select: { userId: true },
    });

    const allowedApproverUserIds = Array.from(new Set([userId, ...substituteFor.map((s) => s.userId)]));

    const steps = await prisma.invoiceApprovalStep.findMany({
      where: {
        firmId,
        status: "pending",
        approverUserId: { in: allowedApproverUserIds },
        scope: {
          is: {
            status: "active",
            plan: { is: { status: "active" } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
      take: 50,
      select: {
        id: true,
        scopeId: true,
        stepIndex: true,
        approverUserId: true,
        createdAt: true,
        invoice: {
          select: {
            id: true,
            invoiceNo: true,
            status: true,
            totalAmount: true,
            currencyCode: true,
            invoiceDate: true,
            dueDate: true,
            vendor: { select: { name: true } },
          },
        },
        approverUser: { select: { id: true, name: true, email: true } },
        scope: {
          select: {
            id: true,
            scopeType: true,
            scopeKey: true,
            amount: true,
            currencyCode: true,
            plan: {
              select: {
                id: true,
                createdAt: true,
                requesterUser: { select: { id: true, name: true, email: true } },
              },
            },
          },
        },
      },
    });

    const items = steps.map((step) => ({
      stepId: step.id,
      scopeId: step.scopeId,
      stepIndex: step.stepIndex,
      invoice: {
        id: step.invoice.id,
        invoiceNo: step.invoice.invoiceNo,
        status: step.invoice.status,
        totalAmount: step.invoice.totalAmount,
        currencyCode: step.invoice.currencyCode,
        invoiceDate: step.invoice.invoiceDate,
        dueDate: step.invoice.dueDate,
        vendorName: step.invoice.vendor?.name ?? null,
      },
      scope: {
        id: step.scope.id,
        scopeType: step.scope.scopeType,
        scopeKey: step.scope.scopeKey,
        amount: step.scope.amount,
        currencyCode: step.scope.currencyCode,
        requestedAt: step.scope.plan.createdAt,
        requester: step.scope.plan.requesterUser,
      },
      approver: step.approverUser,
      actingAsSubstitute: step.approverUserId !== userId,
    }));

    return NextResponse.json({ items }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load approvals inbox";
    const status = message.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

