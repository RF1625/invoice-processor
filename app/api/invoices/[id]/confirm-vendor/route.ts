import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFirmId } from "@/lib/tenant";
import { validateRequestOrigin } from "@/lib/auth";
import { Prisma } from "@prisma/client";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const originCheck = validateRequestOrigin(req);
    if (!originCheck.ok) {
      return NextResponse.json({ error: originCheck.error }, { status: 403 });
    }

    const params = await context.params;
    const firmId = await requireFirmId();
    const body = (await req.json()) as { vendorId?: string };
    const vendorId = body.vendorId;
    if (!vendorId || typeof vendorId !== "string") {
      return NextResponse.json({ error: "vendorId is required" }, { status: 400 });
    }

    const invoice = await prisma.invoice.findFirst({ where: { id: params.id, firmId }, select: { id: true, status: true } });
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

    const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, firmId }, select: { id: true, vendorNo: true } });
    if (!vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });

    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        vendorId: vendor.id,
        vendorNo: vendor.vendorNo,
        vendorMatchStatus: "matched",
        vendorMatchConfidence: new Prisma.Decimal(1),
        status: invoice.status === "pending_approval" ? invoice.status : "draft",
      },
      include: { vendor: true },
    });

    return NextResponse.json({ invoice: updated }, { status: 200 });
  } catch (err) {
    console.error("Failed to confirm invoice vendor", err);
    return NextResponse.json({ error: "Failed to confirm invoice vendor" }, { status: 500 });
  }
}

