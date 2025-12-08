import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFirmId } from "@/lib/tenant";

const normalizeStatus = (raw: unknown) => {
  const value = (raw ?? "").toString().toLowerCase();
  if (value === "approved" || value === "approve") return "approved";
  if (value === "rejected" || value === "reject") return "rejected";
  return "pending";
};

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const firmId = await requireFirmId();
    const body = await req.json();
    const comment: string | null = body.comment ?? null;
    const userId: string | null = body.userId ?? null;
    const status = normalizeStatus(body.status);
    const actedAt = status === "pending" ? null : new Date();

    const invoice = await prisma.invoice.findFirst({ where: { id: params.id, firmId } });
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

    const nextInvoiceStatus =
      status === "approved" ? "approved" : status === "rejected" ? "rejected" : "pending_approval";

    const [approval, updatedInvoice] = await prisma.$transaction([
      prisma.invoiceApproval.create({
        data: {
          firmId,
          invoiceId: invoice.id,
          userId,
          status,
          comment,
          actedAt,
        },
      }),
      prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: nextInvoiceStatus },
      }),
    ]);

    return NextResponse.json({ approval, invoice: updatedInvoice }, { status: 201 });
  } catch (err) {
    console.error("Failed to record approval", err);
    return NextResponse.json({ error: "Failed to record approval" }, { status: 500 });
  }
}
