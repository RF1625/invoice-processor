export type InvoiceApprovalInput = {
  id: string
  status: string
  comment?: string | null
  actedAt?: string | null
  createdAt: string
}

export type InvoiceInput = {
  id: string
  invoiceNo?: string | null
  vendorName?: string | null
  status: string
  currencyCode?: string | null
  totalAmount: number
  taxAmount: number
  netAmount: number
  invoiceDate?: string | null
  dueDate?: string | null
  approvals: InvoiceApprovalInput[]
  approvalApprover?: { id: string; name: string | null; email: string } | null
}
