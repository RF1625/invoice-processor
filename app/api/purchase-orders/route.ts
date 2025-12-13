import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireFirmId, requireSession } from "@/lib/tenant";
import { validateRequestOrigin } from "@/lib/auth";

const toDecimal = (value: unknown, fallback = 0) => new Prisma.Decimal(typeof value === "number" || typeof value === "string" ? value : fallback);
const toDate = (value: unknown) => (value ? new Date(value as string) : null);
const toJson = (value: unknown) => (value && typeof value === "object" ? value : {});

export async function GET(req: NextRequest) {
  try {
    const firmId = await requireFirmId();
    const status = req.nextUrl.searchParams.get("status") ?? undefined;
    const vendorId = req.nextUrl.searchParams.get("vendorId") ?? undefined;
    const takeParam = Number(req.nextUrl.searchParams.get("take") ?? "25");
    const take = Number.isFinite(takeParam) && takeParam > 0 ? Math.min(Math.floor(takeParam), 100) : 25;

    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where: {
        firmId,
        ...(status ? { status } : {}),
        ...(vendorId ? { vendorId } : {}),
      },
      include: {
        vendor: true,
        _count: { select: { lines: true } },
      },
      orderBy: { createdAt: "desc" },
      take,
    });

    return NextResponse.json({ purchaseOrders }, { status: 200 });
  } catch (err) {
    console.error("Failed to fetch purchase orders", err);
    return NextResponse.json({ error: "Failed to fetch purchase orders" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const originCheck = validateRequestOrigin(req);
    if (!originCheck.ok) {
      return NextResponse.json({ error: originCheck.error }, { status: 403 });
    }

    const session = await requireSession();
    const firmId = session.firmId;
    const body = await req.json();

    if (!body.poNumber) {
      return NextResponse.json({ error: "poNumber is required" }, { status: 400 });
    }

    type LineInput = {
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
    const normalizedLines = lines.map((line, idx) => {
      const quantity = toDecimal(line.quantity ?? 1);
      const unitCost = toDecimal(line.unitCost ?? 0);
      const lineAmount = line.lineAmount != null ? toDecimal(line.lineAmount) : quantity.mul(unitCost);
      const receivedQuantity = toDecimal(line.receivedQuantity ?? 0);
      const invoicedQuantity = toDecimal(line.invoicedQuantity ?? 0);

      return {
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

    const totalAmount = normalizedLines.reduce((sum, l) => sum.plus(l.lineAmount), new Prisma.Decimal(0));
    const receivedAmount = normalizedLines.reduce(
      (sum, l) => sum.plus(l.receivedQuantity.mul(l.unitCost)),
      new Prisma.Decimal(0),
    );
    const invoicedAmount = normalizedLines.reduce(
      (sum, l) => sum.plus(l.invoicedQuantity.mul(l.unitCost)),
      new Prisma.Decimal(0),
    );

    const purchaseOrder = await prisma.purchaseOrder.create({
      data: {
        firmId,
        vendorId: body.vendorId ?? null,
        poNumber: body.poNumber,
        status: body.status ?? "open",
        currencyCode: body.currencyCode ?? null,
        orderDate: toDate(body.orderDate),
        expectedDate: toDate(body.expectedDate),
        description: body.description ?? null,
        notes: body.notes ?? null,
        totalAmount,
        receivedAmount,
        invoicedAmount,
        createdBy: session.userId ?? null,
        updatedBy: session.userId ?? null,
        lines: {
          create: normalizedLines.map((l) => ({
            firmId,
            lineNo: l.lineNo,
            description: l.description,
            quantity: l.quantity,
            unitCost: l.unitCost,
            lineAmount: l.lineAmount,
            receivedQuantity: l.receivedQuantity,
            invoicedQuantity: l.invoicedQuantity,
            glAccountNo: l.glAccountNo,
            dimensionValues: l.dimensionValues,
            active: l.active,
          })),
        },
      },
      include: {
        lines: true,
        vendor: true,
      },
    });

    return NextResponse.json({ purchaseOrder }, { status: 201 });
  } catch (err) {
    console.error("Failed to create purchase order", err);
    return NextResponse.json({ error: "Failed to create purchase order" }, { status: 400 });
  }
}
