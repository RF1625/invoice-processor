import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireFirmId } from "@/lib/tenant";

export async function GET(req: NextRequest) {
  try {
    const firmId = await requireFirmId();
    const vendorId = req.nextUrl.searchParams.get("vendorId") ?? undefined;
    const poNumber = req.nextUrl.searchParams.get("poNumber") ?? undefined;

    const lines = await prisma.purchaseOrderLine.findMany({
      where: {
        firmId,
        active: true,
        purchaseOrder: {
          firmId,
          ...(vendorId ? { vendorId } : {}),
          ...(poNumber ? { poNumber: { contains: poNumber, mode: "insensitive" as const } } : {}),
          status: { notIn: ["cancelled", "closed"] },
        },
      },
      include: {
        purchaseOrder: true,
      },
      orderBy: [{ purchaseOrder: { orderDate: "desc" } }, { lineNo: "asc" }],
    });

    const mapped = lines
      .map((line) => {
        const availableQty = new Prisma.Decimal(line.quantity).minus(line.invoicedQuantity);
        if (availableQty.lte(0)) return null;
        return {
          id: line.id,
          purchaseOrderId: line.purchaseOrderId,
          poNumber: line.purchaseOrder.poNumber,
          vendorId: line.purchaseOrder.vendorId,
          lineNo: line.lineNo,
          description: line.description,
          quantity: line.quantity,
          unitCost: line.unitCost,
          lineAmount: line.lineAmount,
          availableQuantity: availableQty,
          glAccountNo: line.glAccountNo,
          dimensionValues: line.dimensionValues,
          expectedDate: line.purchaseOrder.expectedDate,
          status: line.purchaseOrder.status,
        };
      })
      .filter((line): line is NonNullable<typeof line> => Boolean(line));

    return NextResponse.json({ lines: mapped }, { status: 200 });
  } catch (err) {
    console.error("Failed to fetch open purchase order lines", err);
    return NextResponse.json({ error: "Failed to fetch open purchase order lines" }, { status: 500 });
  }
}
