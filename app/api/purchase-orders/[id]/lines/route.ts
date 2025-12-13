import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireFirmId, requireSession } from "@/lib/tenant";
import { validateRequestOrigin } from "@/lib/auth";

const toDecimal = (value: unknown, fallback = 0) => new Prisma.Decimal(typeof value === "number" || typeof value === "string" ? value : fallback);
const toJson = (value: unknown) => (value && typeof value === "object" ? value : {});

const recalcTotals = (lines: { lineAmount: Prisma.Decimal; unitCost: Prisma.Decimal; receivedQuantity: Prisma.Decimal; invoicedQuantity: Prisma.Decimal }[]) => {
  const totalAmount = lines.reduce((sum, l) => sum.plus(l.lineAmount), new Prisma.Decimal(0));
  const receivedAmount = lines.reduce((sum, l) => sum.plus(l.receivedQuantity.mul(l.unitCost)), new Prisma.Decimal(0));
  const invoicedAmount = lines.reduce((sum, l) => sum.plus(l.invoicedQuantity.mul(l.unitCost)), new Prisma.Decimal(0));
  return { totalAmount, receivedAmount, invoicedAmount };
};

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const firmId = await requireFirmId();
    const lines = await prisma.purchaseOrderLine.findMany({
      where: { purchaseOrderId: params.id, firmId },
      orderBy: { lineNo: "asc" },
    });
    return NextResponse.json({ lines }, { status: 200 });
  } catch (err) {
    console.error("Failed to fetch purchase order lines", err);
    return NextResponse.json({ error: "Failed to fetch purchase order lines" }, { status: 500 });
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
    type LineInput = {
      id?: string;
      lineNo?: number;
      description?: string | null;
      quantity?: number | string | Prisma.Decimal;
      unitCost?: number | string | Prisma.Decimal;
      lineAmount?: number | string | Prisma.Decimal;
      receivedQuantity?: number | string | Prisma.Decimal;
      invoicedQuantity?: number | string | Prisma.Decimal;
      glAccountNo?: string | null;
      dimensionValues?: Record<string, unknown>;
      active?: boolean;
    };
    const lines: LineInput[] = Array.isArray(body.lines) ? body.lines : [];

    const existing = await prisma.purchaseOrder.findFirst({
      where: { id: params.id, firmId },
      include: { lines: true },
    });
    if (!existing) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });

    const normalized = lines.map((line, idx) => {
      const quantity = toDecimal(line.quantity ?? 1);
      const unitCost = toDecimal(line.unitCost ?? 0);
      const lineAmount = line.lineAmount != null ? toDecimal(line.lineAmount) : quantity.mul(unitCost);
      const receivedQuantity = toDecimal(line.receivedQuantity ?? 0);
      const invoicedQuantity = toDecimal(line.invoicedQuantity ?? 0);
      return {
        id: line.id as string | undefined,
        lineNo: line.lineNo ?? idx + 1,
        description: line.description ?? null,
        quantity,
        unitCost,
        lineAmount,
        receivedQuantity,
        invoicedQuantity,
        glAccountNo: line.glAccountNo ?? null,
        dimensionValues: toJson(line.dimensionValues),
        active: line.active ?? true,
      };
    });

    const toDelete = existing.lines
      .filter((line) => !normalized.some((l) => l.id === line.id))
      .map((l) => l.id);

    await prisma.$transaction(async (tx) => {
      if (toDelete.length) {
        await tx.purchaseOrderLine.deleteMany({ where: { id: { in: toDelete }, purchaseOrderId: params.id } });
      }

      for (const line of normalized) {
        if (line.id) {
          await tx.purchaseOrderLine.update({
            where: { id: line.id },
            data: {
              lineNo: line.lineNo,
              description: line.description,
              quantity: line.quantity,
              unitCost: line.unitCost,
              lineAmount: line.lineAmount,
              receivedQuantity: line.receivedQuantity,
              invoicedQuantity: line.invoicedQuantity,
              glAccountNo: line.glAccountNo,
              dimensionValues: line.dimensionValues,
              active: line.active,
            },
          });
        } else {
          await tx.purchaseOrderLine.create({
            data: {
              firmId,
              purchaseOrderId: params.id,
              lineNo: line.lineNo,
              description: line.description,
              quantity: line.quantity,
              unitCost: line.unitCost,
              lineAmount: line.lineAmount,
              receivedQuantity: line.receivedQuantity,
              invoicedQuantity: line.invoicedQuantity,
              glAccountNo: line.glAccountNo,
              dimensionValues: line.dimensionValues,
              active: line.active,
            },
          });
        }
      }

      const updatedLines = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: params.id } });
      const totals = recalcTotals(updatedLines);
      await tx.purchaseOrder.update({
        where: { id: params.id },
        data: {
          totalAmount: totals.totalAmount,
          receivedAmount: totals.receivedAmount,
          invoicedAmount: totals.invoicedAmount,
          updatedBy: session.userId ?? existing.updatedBy,
        },
      });
    });

    const refreshed = await prisma.purchaseOrder.findFirst({
      where: { id: params.id, firmId },
      include: { lines: { orderBy: { lineNo: "asc" } } },
    });

    return NextResponse.json({ purchaseOrder: refreshed }, { status: 200 });
  } catch (err) {
    console.error("Failed to upsert purchase order lines", err);
    return NextResponse.json({ error: "Failed to update purchase order lines" }, { status: 400 });
  }
}
