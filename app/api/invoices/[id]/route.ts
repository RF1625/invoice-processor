import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFirmId } from "@/lib/tenant";
import { validateRequestOrigin } from "@/lib/auth";
import { removeStorageFiles } from "@/lib/storage";

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
        approvalApprover: { select: { id: true, name: true, email: true } },
      },
    });
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    const safeInvoice = {
      ...invoice,
      files: invoice.files.map((file) => ({
        ...file,
        sizeBytes: file.sizeBytes != null ? Number(file.sizeBytes) : null,
      })),
    };
    return NextResponse.json({ invoice: safeInvoice }, { status: 200 });
  } catch (err) {
    console.error("Failed to fetch invoice", err);
    return NextResponse.json({ error: "Failed to fetch invoice" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const originCheck = validateRequestOrigin(req);
    if (!originCheck.ok) {
      return NextResponse.json({ error: originCheck.error }, { status: 403 });
    }

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

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const originCheck = validateRequestOrigin(req);
    if (!originCheck.ok) {
      return NextResponse.json({ error: originCheck.error }, { status: 403 });
    }

    const params = await context.params;
    const firmId = await requireFirmId();
    const invoice = await prisma.invoice.findFirst({
      where: { id: params.id, firmId },
      include: { files: true },
    });
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

    const storagePaths = invoice.files.map((file) => file.storagePath).filter(Boolean);

    await prisma.$transaction(async (tx) => {
      await tx.invoiceApprovalStep.deleteMany({ where: { invoiceId: invoice.id } });
      await tx.invoiceApprovalScope.deleteMany({ where: { invoiceId: invoice.id } });
      await tx.invoiceApprovalPlan.deleteMany({ where: { invoiceId: invoice.id } });
      await tx.invoiceApproval.deleteMany({ where: { invoiceId: invoice.id } });
      await tx.ruleApplyLog.deleteMany({ where: { invoiceId: invoice.id } });
      await tx.invoiceLine.deleteMany({ where: { invoiceId: invoice.id } });
      await tx.navPostLog.deleteMany({ where: { invoiceId: invoice.id } });
      await tx.file.deleteMany({ where: { invoiceId: invoice.id } });
      await tx.invoice.delete({ where: { id: invoice.id } });
    });

    if (storagePaths.length > 0) {
      try {
        await removeStorageFiles(storagePaths);
      } catch (err) {
        console.error("Failed to delete invoice files from storage", err);
        return NextResponse.json({ ok: true, storageDeleted: false }, { status: 200 });
      }
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("Failed to delete invoice", err);
    return NextResponse.json({ error: "Failed to delete invoice" }, { status: 500 });
  }
}
