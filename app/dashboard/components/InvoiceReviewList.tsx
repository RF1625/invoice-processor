"use client"

import { useEffect, useState } from "react"
import { Check, X, Loader2, AlertCircle, FileText, ChevronDown, ChevronUp, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"
import { readJson } from "@/lib/http"

type InvoiceApprovalInput = {
    id: string
    status: string
    comment?: string | null
    actedAt?: string | null
    createdAt: string
}

type InvoiceInput = {
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

export function InvoiceReviewList() {
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [invoices, setInvoices] = useState<InvoiceInput[]>([])
    const [actioningId, setActioningId] = useState<string | null>(null)
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

    const fetchInvoices = async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await fetch("/api/invoices?take=50", { cache: "no-store" })
            const json = await readJson<{ invoices?: any[]; error?: string }>(res)
            if (!res.ok) throw new Error(json.error ?? "Failed to load invoices")

            const mapped: InvoiceInput[] = (json.invoices ?? []).map((inv: any) => ({
                id: inv.id,
                invoiceNo: inv.invoiceNo,
                vendorName: inv.vendor?.name ?? null,
                status: inv.status,
                currencyCode: inv.currencyCode,
                totalAmount: Number(inv.totalAmount ?? 0),
                taxAmount: Number(inv.taxAmount ?? 0),
                netAmount: Number(inv.netAmount ?? 0),
                invoiceDate: inv.invoiceDate,
                dueDate: inv.dueDate,
                approvals: (inv.approvals ?? []).map((a: any) => ({
                    id: a.id,
                    status: a.status,
                    comment: a.comment,
                    actedAt: a.actedAt ?? a.acted_at ?? null,
                    createdAt: (a.createdAt ?? a.created_at)?.toString?.() ?? "",
                })),
                approvalApprover: inv.approvalApprover
                    ? { id: inv.approvalApprover.id, name: inv.approvalApprover.name ?? null, email: inv.approvalApprover.email }
                    : null,
            }))

            const pending = mapped.filter(inv =>
                inv.status === "pending" || inv.status === "pending_approval" || inv.status === "needs_review"
            )

            setInvoices(pending)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load invoices")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        void fetchInvoices()
    }, [])

    const toggleExpand = (id: string) => {
        setExpandedIds(current => {
            const next = new Set(current)
            if (next.has(id)) {
                next.delete(id)
            } else {
                next.add(id)
            }
            return next
        })
    }

    const handleAction = async (invoiceId: string, status: "approved" | "rejected") => {
        setActioningId(invoiceId)
        try {
            const res = await fetch(`/api/invoices/${invoiceId}/approvals`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status, comment: null }),
            })
            if (!res.ok) throw new Error("Failed to update status")

            setInvoices(current => current.filter(i => i.id !== invoiceId))
            setExpandedIds(current => {
                const next = new Set(current)
                next.delete(invoiceId)
                return next
            })
            router.refresh()
        } catch (err) {
            alert("Failed to update status")
        } finally {
            setActioningId(null)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
            </div>
        )
    }

    if (error) {
        return (
            <div className="rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-600">
                <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    <p>{error}</p>
                </div>
                <Button variant="link" onClick={() => fetchInvoices()} className="mt-1 h-auto p-0 text-red-700 underline">Retry</Button>
            </div>
        )
    }

    if (invoices.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-50">
                    <Check className="h-6 w-6 text-slate-300" />
                </div>
                <h3 className="mt-4 text-sm font-semibold text-slate-900">All caught up</h3>
                <p className="mt-1 text-xs text-slate-500">No invoices currently need your review.</p>
            </div>
        )
    }

    return (
        <div className="bg-white">
            <table className="w-full text-left text-sm">
                <thead className="bg-slate-50/50 text-xs font-medium text-slate-500">
                    <tr>
                        <th className="px-6 py-4 font-semibold">Invoice</th>
                        <th className="px-6 py-4 font-semibold">Vendor</th>
                        <th className="px-6 py-4 font-semibold">Date received</th>
                        <th className="px-6 py-4 font-semibold">Due</th>
                        <th className="px-6 py-4 text-right font-semibold">Amount</th>
                        <th className="px-6 py-4 text-right font-semibold">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {invoices.map((invoice) => {
                        const isExpanded = expandedIds.has(invoice.id)
                        const currencyFormatter = new Intl.NumberFormat('en-US', {
                            style: 'currency',
                            currency: invoice.currencyCode || 'USD'
                        })

                        return (
                            <>
                                <tr
                                    key={invoice.id}
                                    className={`group cursor-pointer transition-colors hover:bg-slate-50/50 ${isExpanded ? "bg-slate-50/80" : ""}`}
                                    onClick={() => toggleExpand(invoice.id)}
                                >
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className={`flex h-8 w-8 items-center justify-center rounded-full transition-transform duration-200 ${isExpanded ? "bg-indigo-100 text-indigo-600 rotate-180" : "bg-slate-100 text-slate-500"}`}>
                                                <ChevronDown className="h-4 w-4" />
                                            </div>
                                            <div>
                                                <div className="font-medium text-slate-900">{invoice.invoiceNo || "Untitled"}</div>
                                                <div className="text-xs text-slate-500">#{invoice.id.slice(0, 8)}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-slate-600">
                                        {invoice.vendorName || "Unknown Vendor"}
                                    </td>
                                    <td className="px-6 py-4 text-slate-600">
                                        {invoice.approvals[0]?.createdAt
                                            ? new Date(invoice.approvals[0].createdAt).toLocaleDateString()
                                            : "Just now"}
                                    </td>
                                    <td className="px-6 py-4 text-slate-600">
                                        {invoice.dueDate
                                            ? new Date(invoice.dueDate).toLocaleDateString()
                                            : <span className="text-slate-400 italic">No due date</span>}
                                    </td>
                                    <td className="px-6 py-4 text-right font-mono text-slate-900">
                                        {currencyFormatter.format(invoice.totalAmount)}
                                    </td>
                                    <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex justify-end gap-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-8 w-8 rounded-full border-slate-200 p-0 text-slate-400 hover:border-slate-300 hover:text-red-600"
                                                onClick={() => handleAction(invoice.id, "rejected")}
                                                disabled={actioningId === invoice.id}
                                                title="Reject"
                                            >
                                                <X className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                size="sm"
                                                className="h-8 w-8 rounded-full bg-slate-900 p-0 text-white hover:bg-slate-800"
                                                onClick={() => handleAction(invoice.id, "approved")}
                                                disabled={actioningId === invoice.id}
                                                title="Approve"
                                            >
                                                {actioningId === invoice.id ? (
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                ) : (
                                                    <Check className="h-4 w-4" />
                                                )}
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                                {isExpanded && (
                                    <tr className="bg-slate-50/50">
                                        <td colSpan={6} className="p-0 border-b border-slate-100 bg-slate-50/50">
                                            <div className="grid grid-cols-1 border-b border-slate-100 lg:grid-cols-2 animate-in slide-in-from-top-2 fade-in duration-300">
                                                {/* PDF Viewer Section */}
                                                <div className="relative h-[600px] w-full border-r border-slate-200 bg-slate-200/50 lg:h-[600px]">
                                                    <iframe
                                                        src={`/api/invoices/${invoice.id}/file`}
                                                        className="h-full w-full border-0"
                                                        title="Invoice PDF"
                                                    />
                                                    <div className="absolute top-4 right-4">
                                                        <a
                                                            href={`/api/invoices/${invoice.id}/file`}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/5 transition hover:bg-slate-50"
                                                            title="Open in new tab"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <Download className="h-4 w-4 text-slate-600" />
                                                        </a>
                                                    </div>
                                                </div>

                                                {/* Details Section */}
                                                <div className="p-8">
                                                    <h3 className="text-lg font-semibold text-slate-900">Invoice details</h3>
                                                    <p className="text-sm text-slate-500">Review the details below before approving.</p>

                                                    <div className="mt-8 space-y-6">
                                                        <div className="grid grid-cols-2 gap-x-8 gap-y-6 text-sm">
                                                            <div>
                                                                <span className="block text-xs font-medium text-slate-500 mb-1">Vendor</span>
                                                                <span className="font-medium text-slate-900">{invoice.vendorName || "Unknown"}</span>
                                                            </div>
                                                            <div>
                                                                <span className="block text-xs font-medium text-slate-500 mb-1">Invoice Number</span>
                                                                <span className="font-medium text-slate-900">{invoice.invoiceNo || "—"}</span>
                                                            </div>

                                                            <div>
                                                                <span className="block text-xs font-medium text-slate-500 mb-1">Invoice Date</span>
                                                                <span className="text-slate-900">
                                                                    {invoice.invoiceDate
                                                                        ? new Date(invoice.invoiceDate).toLocaleDateString()
                                                                        : "—"}
                                                                </span>
                                                            </div>
                                                            <div>
                                                                <span className="block text-xs font-medium text-slate-500 mb-1">Due Date</span>
                                                                <span className={`font-medium ${invoice.dueDate && new Date(invoice.dueDate) < new Date() ? "text-red-600" : "text-slate-900"}`}>
                                                                    {invoice.dueDate
                                                                        ? new Date(invoice.dueDate).toLocaleDateString()
                                                                        : "—"}
                                                                </span>
                                                            </div>

                                                            <div className="pt-4 border-t border-slate-100 col-span-2 grid grid-cols-2 gap-x-8 gap-y-2">
                                                                <div>
                                                                    <span className="block text-xs font-medium text-slate-500">Net Amount</span>
                                                                    <span className="font-mono text-slate-600">{currencyFormatter.format(invoice.netAmount)}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="block text-xs font-medium text-slate-500">GST (Tax)</span>
                                                                    <span className="font-mono text-slate-600">{currencyFormatter.format(invoice.taxAmount)}</span>
                                                                </div>
                                                                <div className="col-span-2 mt-2 pt-2 border-t border-slate-100">
                                                                    <span className="block text-xs font-medium text-slate-500">Total Amount</span>
                                                                    <span className="text-lg font-mono font-semibold text-slate-900">
                                                                        {currencyFormatter.format(invoice.totalAmount)}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="rounded-xl bg-blue-50/50 p-4 border border-blue-100/50">
                                                            <div className="flex gap-3">
                                                                <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0" />
                                                                <div>
                                                                    <h4 className="font-medium text-blue-900 text-sm">Verify details</h4>
                                                                    <p className="text-xs text-blue-700 mt-1">
                                                                        Please check that the line items and tax amounts match the document before approving.
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="flex gap-3 pt-6 border-t border-slate-100">
                                                            <Button
                                                                variant="outline"
                                                                onClick={() => handleAction(invoice.id, "rejected")}
                                                                disabled={actioningId === invoice.id}
                                                                className="flex-1"
                                                            >
                                                                Reject
                                                            </Button>
                                                            <Button
                                                                onClick={() => handleAction(invoice.id, "approved")}
                                                                disabled={actioningId === invoice.id}
                                                                className="flex-1 bg-slate-900 text-white hover:bg-slate-800"
                                                            >
                                                                {actioningId === invoice.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                                Approve Invoice
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}
