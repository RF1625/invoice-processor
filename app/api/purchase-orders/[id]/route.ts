import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireFirmId, requireSession } from "@/lib/tenant";
import { validateRequestOrigin } from "@/lib/auth";

const toDate = (value: unknown) => (value ? new Date(value as string) : null);

const aggregateTotals = (lines: { lineAmount: Prisma.Decimal; unitCost: Prisma.Decimal; receivedQuantity: Prisma.Decimal; invoicedQuantity: Prisma.Decimal }[]) => {
  const totalAmount = lines.reduce((sum, l) => sum.plus(l.lineAmount), new Prisma.Decimal(0));
  const receivedAmount = lines.reduce((sum, l) => sum.plus(l.receivedQuantity.mul(l.unitCost)), new Prisma.Decimal(0));
  const invoicedAmount = lines.reduce((sum, l) => sum.plus(l.invoicedQuantity.mul(l.unitCost)), new Prisma.Decimal(0));
  return { totalAmount, receivedAmount, invoicedAmount };
};

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const firmId = await requireFirmId();
    const purchaseOrder = await prisma.purchaseOrder.findFirst({
      where: { id: params.id, firmId },
      include: {
        vendor: true,
        lines: { orderBy: { lineNo: "asc" } },
        receipts: { orderBy: { receiptDate: "desc" } },
      },
    });
    if (!purchaseOrder) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });

    return NextResponse.json({ purchaseOrder }, { status: 200 });
  } catch (err) {
    console.error("Failed to fetch purchase order", err);
    return NextResponse.json({ error: "Failed to fetch purchase order" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const originCheck = validateRequestOrigin(req);
    if (!originCheck.ok) {
      return NextResponse.json({ error: originCheck.error }, { status: 403 });
    }

    const params = await context.params;
    const session = await requireSession();
    const firmId = session.firmId;
    const body = await req.json();

    const existing = await prisma.purchaseOrder.findFirst({
      where: { id: params.id, firmId },
      include: { lines: true },
    });

    if (!existing) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });

    const totals = aggregateTotals(existing.lines);

    const updated = await prisma.purchaseOrder.update({
      where: { id: params.id },
      data: {
        vendorId: body.vendorId ?? existing.vendorId,
        poNumber: body.poNumber ?? existing.poNumber,
        status: body.status ?? existing.status,
        currencyCode: body.currencyCode ?? existing.currencyCode,
        orderDate: body.orderDate ? toDate(body.orderDate) : existing.orderDate,
        expectedDate: body.expectedDate ? toDate(body.expectedDate) : existing.expectedDate,
        description: body.description ?? existing.description,
        notes: body.notes ?? existing.notes,
        totalAmount: body.recalculateTotals ? totals.totalAmount : existing.totalAmount,
        receivedAmount: body.recalculateTotals ? totals.receivedAmount : existing.receivedAmount,
        invoicedAmount: body.recalculateTotals ? totals.invoicedAmount : existing.invoicedAmount,
        updatedBy: session.userId ?? existing.updatedBy,
      },
      include: {
        vendor: true,
        lines: { orderBy: { lineNo: "asc" } },
        receipts: { orderBy: { receiptDate: "desc" } },
      },
    });

    return NextResponse.json({ purchaseOrder: updated }, { status: 200 });
  } catch (err) {
    console.error("Failed to update purchase order", err);
    return NextResponse.json({ error: "Failed to update purchase order" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const originCheck = validateRequestOrigin(req);
    if (!originCheck.ok) {
      return NextResponse.json({ error: originCheck.error }, { status: 403 });
    }

    const params = await context.params;
    const session = await requireSession();
    const firmId = session.firmId;

    const existing = await prisma.purchaseOrder.findFirst({ where: { id: params.id, firmId } });
    if (!existing) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });

    const cancelled = await prisma.purchaseOrder.update({
      where: { id: params.id },
      data: { status: "cancelled", updatedBy: session.userId ?? existing.updatedBy },
    });

    return NextResponse.json({ purchaseOrder: cancelled }, { status: 200 });
  } catch (err) {
    console.error("Failed to cancel purchase order", err);
    return NextResponse.json({ error: "Failed to cancel purchase order" }, { status: 400 });
  }
}
