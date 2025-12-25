import { prisma } from "@/lib/prisma"
import { requireFirmId } from "@/lib/tenant"
import type { InvoiceInput } from "./types"

const pendingStatuses = ["pending", "pending_approval", "needs_review"]

export async function getPendingInvoices(): Promise<InvoiceInput[]> {
  const firmId = await requireFirmId()
  const invoices = await prisma.invoice.findMany({
    where: { firmId, status: { in: pendingStatuses } },
    include: {
      vendor: true,
      approvals: { orderBy: { createdAt: "desc" } },
      approvalApprover: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  })

  return invoices.map((inv) => ({
    id: inv.id,
    invoiceNo: inv.invoiceNo,
    vendorName: inv.vendor?.name ?? null,
    status: inv.status,
    currencyCode: inv.currencyCode,
    totalAmount: Number(inv.totalAmount ?? 0),
    taxAmount: Number(inv.taxAmount ?? 0),
    netAmount: Number(inv.netAmount ?? 0),
    invoiceDate: inv.invoiceDate ? inv.invoiceDate.toISOString() : null,
    dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
    approvals: (inv.approvals ?? []).map((a) => ({
      id: a.id,
      status: a.status,
      comment: a.comment,
      actedAt: a.actedAt ? a.actedAt.toISOString() : null,
      createdAt: a.createdAt ? a.createdAt.toISOString() : "",
    })),
    approvalApprover: inv.approvalApprover
      ? {
          id: inv.approvalApprover.id,
          name: inv.approvalApprover.name ?? null,
          email: inv.approvalApprover.email,
        }
      : null,
  }))
}
