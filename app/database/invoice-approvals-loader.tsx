"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { InvoiceApprovalPanel } from "./forms";

type InvoiceApprovalInput = { id: string; status: string; comment?: string | null; actedAt?: string | null; createdAt: string };
type InvoiceInput = {
  id: string;
  invoiceNo?: string | null;
  vendorName?: string | null;
  status: string;
  currencyCode?: string | null;
  totalAmount: number;
  approvals: InvoiceApprovalInput[];
  approvalApprover?: { id: string; name: string | null; email: string } | null;
};

export function InvoiceApprovalsLoader() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<InvoiceInput[]>([]);

  const fetchInvoices = async (activeRef?: { current: boolean }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/invoices?take=10", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load invoices");
      const mapped: InvoiceInput[] = (json.invoices ?? []).map((inv: any) => ({
        id: inv.id,
        invoiceNo: inv.invoiceNo,
        vendorName: inv.vendor?.name ?? null,
        status: inv.status,
        currencyCode: inv.currencyCode,
        totalAmount: Number(inv.totalAmount ?? 0),
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
      }));
      if (!activeRef || activeRef.current) setInvoices(mapped);
    } catch (err) {
      if (!activeRef || activeRef.current) {
        setError(err instanceof Error ? err.message : "Failed to load invoices");
      }
    } finally {
      if (!activeRef || activeRef.current) setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const active = { current: true };
    void fetchInvoices(active);
    return () => {
      active.current = false;
    };
  }, []);

  if (loading) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Invoices & approvals</h2>
            <p className="text-xs text-slate-600">Loading latest invoices…</p>
          </div>
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-slate-600" />
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Invoices & approvals</h2>
            <p className="text-xs text-slate-700">Couldn&apos;t load invoices right now.</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setInvoices([]);
              void fetchInvoices();
            }}
          >
            Retry
          </Button>
        </div>
        <p className="mt-2 text-xs">{error}</p>
      </section>
    );
  }

  return <InvoiceApprovalPanel invoices={invoices} />;
}
