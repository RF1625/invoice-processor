import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireFirmId } from "@/lib/tenant";
import { validateRequestOrigin } from "@/lib/auth";

const toDecimal = (value: unknown) => new Prisma.Decimal(typeof value === "number" || typeof value === "string" ? value : 0);

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const originCheck = validateRequestOrigin(req);
    if (!originCheck.ok) {
      return NextResponse.json({ error: originCheck.error }, { status: 403 });
    }

    const params = await context.params;
    const firmId = await requireFirmId();
    const body = await req.json();
    type MatchInput = {
      invoiceLineId: string;
      poLineId?: string | null;
      quantity?: number | string | Prisma.Decimal;
    };
    const matches: MatchInput[] = Array.isArray(body.matches) ? body.matches : [];

    if (!matches.length) {
      return NextResponse.json({ error: "matches is required" }, { status: 400 });
    }

    const invoice = await prisma.invoice.findFirst({ where: { id: params.id, firmId }, include: { lines: true } });
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

    const invoiceLineMap = new Map(invoice.lines.map((line) => [line.id, line]));
    const targetInvoiceLineIds = matches.map((m) => m.invoiceLineId);
    if (!targetInvoiceLineIds.every((id: string) => invoiceLineMap.has(id))) {
      return NextResponse.json({ error: "One or more invoice lines are invalid" }, { status: 400 });
    }

    const poLineIds = Array.from(
      new Set(
        matches
          .map((m) => m.poLineId)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    );
    const poLines = await prisma.purchaseOrderLine.findMany({
      where: { id: { in: poLineIds }, firmId },
      include: { purchaseOrder: true },
    });
    const poLineMap = new Map(poLines.map((line) => [line.id, line]));

    if (poLineIds.length !== poLines.length) {
      return NextResponse.json({ error: "One or more PO lines are invalid" }, { status: 400 });
    }

    // Compute per-PO line adjustments
    const adjustments = new Map<string, { current: Prisma.Decimal; subtract: Prisma.Decimal; add: Prisma.Decimal; capacity: Prisma.Decimal }>();
    for (const poLine of poLines) {
      adjustments.set(poLine.id, {
        current: new Prisma.Decimal(poLine.invoicedQuantity),
        subtract: new Prisma.Decimal(0),
        add: new Prisma.Decimal(0),
        capacity: new Prisma.Decimal(poLine.quantity),
      });
    }

    for (const match of matches) {
      const invoiceLine = invoiceLineMap.get(match.invoiceLineId)!;
      const newQty = toDecimal(match.quantity ?? invoiceLine.quantity);

      if (!match.poLineId || !poLineMap.has(match.poLineId)) {
        return NextResponse.json({ error: "poLineId is required for each match" }, { status: 400 });
      }

      const existingPoLineId = invoiceLine.poLineId ?? undefined;
      const existingQty = new Prisma.Decimal(invoiceLine.matchedQuantity ?? 0);
      if (existingPoLineId && adjustments.has(existingPoLineId)) {
        const current = adjustments.get(existingPoLineId)!;
        current.subtract = current.subtract.plus(existingQty);
      }

      const target = adjustments.get(match.poLineId)!;
      target.add = target.add.plus(newQty);
    }

    for (const [poLineId, adj] of adjustments.entries()) {
      const newTotal = adj.current.minus(adj.subtract).plus(adj.add);
      if (newTotal.gt(adj.capacity)) {
        return NextResponse.json({ error: `PO line ${poLineMap.get(poLineId)?.purchaseOrder.poNumber ?? poLineId} exceeds remaining quantity` }, { status: 400 });
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const match of matches) {
        const invoiceLine = invoiceLineMap.get(match.invoiceLineId)!;
        const newQty = toDecimal(match.quantity ?? invoiceLine.quantity);
        await tx.invoiceLine.update({
          where: { id: match.invoiceLineId },
          data: {
            poLineId: match.poLineId,
            matchedQuantity: newQty,
          },
        });
      }

      for (const [poLineId, adj] of adjustments.entries()) {
        const newTotal = adj.current.minus(adj.subtract).plus(adj.add);
        await tx.purchaseOrderLine.update({
          where: { id: poLineId },
          data: { invoicedQuantity: newTotal },
        });
      }

      const poIds = Array.from(new Set(poLines.map((p) => p.purchaseOrderId)));
      if (poIds.length) {
        const updatedLines = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: { in: poIds } } });
        const byPo = new Map<string, typeof updatedLines>();
        for (const line of updatedLines) {
          const list = byPo.get(line.purchaseOrderId) ?? [];
          list.push(line);
          byPo.set(line.purchaseOrderId, list);
        }
        for (const [poId, lines] of byPo.entries()) {
          const totalAmount = lines.reduce((sum, l) => sum.plus(l.lineAmount), new Prisma.Decimal(0));
          const receivedAmount = lines.reduce((sum, l) => sum.plus(new Prisma.Decimal(l.receivedQuantity).mul(l.unitCost)), new Prisma.Decimal(0));
          const invoicedAmount = lines.reduce((sum, l) => sum.plus(new Prisma.Decimal(l.invoicedQuantity).mul(l.unitCost)), new Prisma.Decimal(0));
          await tx.purchaseOrder.update({
            where: { id: poId },
            data: { totalAmount, receivedAmount, invoicedAmount },
          });
        }
      }
    });

    const refreshed = await prisma.invoice.findFirst({
      where: { id: params.id, firmId },
      include: { lines: true },
    });

    return NextResponse.json({ invoice: refreshed }, { status: 200 });
  } catch (err) {
    console.error("Failed to match invoice to PO", err);
    return NextResponse.json({ error: "Failed to match invoice to PO" }, { status: 400 });
  }
}
