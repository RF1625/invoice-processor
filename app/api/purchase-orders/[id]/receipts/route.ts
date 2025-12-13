import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireFirmId, requireSession } from "@/lib/tenant";
import { validateRequestOrigin } from "@/lib/auth";

const toDecimal = (value: unknown) => new Prisma.Decimal(typeof value === "number" || typeof value === "string" ? value : 0);
const toDate = (value: unknown) => (value ? new Date(value as string) : new Date());

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const firmId = await requireFirmId();
    const receipts = await prisma.purchaseOrderReceipt.findMany({
      where: { purchaseOrderId: params.id, firmId },
      include: { purchaseOrderLine: true },
      orderBy: { receiptDate: "desc" },
    });
    return NextResponse.json({ receipts }, { status: 200 });
  } catch (err) {
    console.error("Failed to fetch PO receipts", err);
    return NextResponse.json({ error: "Failed to fetch receipts" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const originCheck = validateRequestOrigin(req);
    if (!originCheck.ok) {
      return NextResponse.json({ error: originCheck.error }, { status: 403 });
    }

    const params = await context.params;
    const session = await requireSession();
    const firmId = session.firmId;
    const body = await req.json();

    const quantity = toDecimal(body.quantity ?? 0);
    if (quantity.lte(0)) {
      return NextResponse.json({ error: "quantity must be greater than zero" }, { status: 400 });
    }

    const po = await prisma.purchaseOrder.findFirst({
      where: { id: params.id, firmId },
      include: { lines: true },
    });
    if (!po) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });

    const poLine = po.lines.find((l) => l.id === body.purchaseOrderLineId);
    if (!poLine) {
      return NextResponse.json({ error: "purchaseOrderLineId is required" }, { status: 400 });
    }

    const newReceived = new Prisma.Decimal(poLine.receivedQuantity).plus(quantity);
    if (newReceived.gt(poLine.quantity)) {
      return NextResponse.json({ error: "Receipt quantity exceeds ordered quantity" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.purchaseOrderReceipt.create({
        data: {
          firmId,
          purchaseOrderId: params.id,
          purchaseOrderLineId: poLine.id,
          quantity,
          receiptDate: toDate(body.receiptDate),
          note: body.note ?? null,
        },
      });

      await tx.purchaseOrderLine.update({
        where: { id: poLine.id },
        data: { receivedQuantity: newReceived },
      });

      const updatedLines = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: params.id } });
      const totalAmount = updatedLines.reduce((sum, l) => sum.plus(l.lineAmount), new Prisma.Decimal(0));
      const receivedAmount = updatedLines.reduce(
        (sum, l) => sum.plus(new Prisma.Decimal(l.receivedQuantity).mul(l.unitCost)),
        new Prisma.Decimal(0),
      );
      const invoicedAmount = updatedLines.reduce(
        (sum, l) => sum.plus(new Prisma.Decimal(l.invoicedQuantity).mul(l.unitCost)),
        new Prisma.Decimal(0),
      );

      await tx.purchaseOrder.update({
        where: { id: params.id },
        data: { totalAmount, receivedAmount, invoicedAmount, updatedBy: session.userId ?? po.updatedBy },
      });
    });

    const refreshed = await prisma.purchaseOrder.findFirst({ where: { id: params.id, firmId }, include: { receipts: true } });
    return NextResponse.json({ purchaseOrder: refreshed }, { status: 201 });
  } catch (err) {
    console.error("Failed to add PO receipt", err);
    return NextResponse.json({ error: "Failed to add receipt" }, { status: 400 });
  }
}
