import Link from "next/link"
import { Mail, Upload } from "lucide-react"
import { InvoiceReviewList } from "@/app/dashboard/components/InvoiceReviewList"
import { getPendingInvoices } from "@/app/dashboard/data"
import type { InvoiceInput } from "@/app/dashboard/types"

export default async function DashboardPage() {
  let initialInvoices: InvoiceInput[] = []
  let initialError: string | null = null

  try {
    initialInvoices = await getPendingInvoices()
  } catch (err) {
    initialError = err instanceof Error ? err.message : "Failed to load invoices"
  }

  return (
    <main className="min-h-screen bg-slate-50/50 p-8 text-slate-900">
      <div className="mx-auto flex max-w-5xl flex-col gap-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Approvals</h1>
            <p className="mt-1 text-sm text-slate-500">
              Review and approve pending invoices
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/settings/inbox"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-900 shadow-sm"
            >
              <Mail className="h-4 w-4 text-slate-500" />
              Connect email
            </Link>
            <Link
              href="/upload"
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 shadow-sm"
            >
              <Upload className="h-4 w-4 text-white/80" />
              Upload invoice
            </Link>
          </div>
        </header>

        <InvoiceReviewList initialInvoices={initialInvoices} initialError={initialError} />
      </div>
    </main>
  )
}
