import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFirmId } from "@/lib/tenant";

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const firmId = await requireFirmId();
    const invoice = await prisma.invoice.findFirst({
      where: { id: params.id, firmId },
      include: {
        vendor: true,
        approvals: { orderBy: { createdAt: "desc" } },
        files: true,
      },
    });
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    return NextResponse.json({ invoice }, { status: 200 });
  } catch (err) {
    console.error("Failed to fetch invoice", err);
    return NextResponse.json({ error: "Failed to fetch invoice" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const firmId = await requireFirmId();
    const body = await req.json();
    const status: string | undefined = body.status;
    const navDocumentNo: string | undefined = body.navDocumentNo;
    const navStatus: string | undefined = body.navStatus;

    if (!status) {
      return NextResponse.json({ error: "status is required" }, { status: 400 });
    }

    const invoice = await prisma.invoice.findFirst({ where: { id: params.id, firmId } });
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

    const updated = await prisma.invoice.update({
      where: { id: params.id },
      data: {
        status,
        navDocumentNo: navDocumentNo ?? invoice.navDocumentNo,
        navStatus: navStatus ?? invoice.navStatus,
        postedAt: status === "posted" ? new Date() : invoice.postedAt,
      },
    });

    return NextResponse.json({ invoice: updated }, { status: 200 });
  } catch (err) {
    console.error("Failed to update invoice status", err);
    return NextResponse.json({ error: "Failed to update invoice" }, { status: 500 });
  }
}
