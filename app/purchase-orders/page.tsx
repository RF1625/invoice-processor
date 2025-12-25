"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, RefreshCw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { readJson } from "@/lib/http";

const currency = (value?: number | string | null) => {
  const num = typeof value === "string" ? Number(value) : value ?? 0;
  if (Number.isNaN(num)) return "-";
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

type Vendor = { id: string; name: string; vendorNo: string };
type PurchaseOrder = {
  id: string;
  poNumber: string;
  status: string;
  currencyCode?: string | null;
  orderDate?: string | null;
  expectedDate?: string | null;
  totalAmount?: string | number | null;
  vendor?: Vendor | null;
  _count?: { lines: number };
};

type LineInput = {
  description: string;
  quantity: number;
  unitCost: number;
  glAccountNo?: string;
};

export default function PurchaseOrdersPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    poNumber: "",
    vendorId: "",
    currencyCode: "",
    orderDate: "",
    expectedDate: "",
    notes: "",
  });
  const [lines, setLines] = useState<LineInput[]>([{ description: "", quantity: 1, unitCost: 0 }]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [ordersRes, vendorsRes] = await Promise.all([
        fetch("/api/purchase-orders", { cache: "no-store" }),
        fetch("/api/vendors", { cache: "no-store" }),
      ]);
      const ordersJson = await readJson<{ purchaseOrders?: PurchaseOrder[]; error?: string }>(ordersRes);
      const vendorsJson = await readJson<{ vendors?: Vendor[]; error?: string }>(vendorsRes);
      if (!ordersRes.ok) throw new Error(ordersJson.error ?? "Failed to load POs");
      if (!vendorsRes.ok) throw new Error(vendorsJson.error ?? "Failed to load vendors");
      setOrders(ordersJson.purchaseOrders ?? []);
      setVendors(vendorsJson.vendors ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData().catch(() => {});
  }, []);

  const addLine = () => setLines((prev) => [...prev, { description: "", quantity: 1, unitCost: 0 }]);
  const updateLine = (idx: number, patch: Partial<LineInput>) => {
    setLines((prev) => prev.map((line, i) => (i === idx ? { ...line, ...patch } : line)));
  };
  const removeLine = (idx: number) => setLines((prev) => prev.filter((_, i) => i !== idx));

  const lineTotal = useMemo(
    () =>
      lines.reduce((sum, line) => {
        const amount = (line.quantity ?? 0) * (line.unitCost ?? 0);
        return sum + (Number.isFinite(amount) ? amount : 0);
      }, 0),
    [lines],
  );

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          vendorId: form.vendorId || null,
          lines: lines.map((line, idx) => ({
            lineNo: idx + 1,
            description: line.description,
            quantity: Number(line.quantity) || 0,
            unitCost: Number(line.unitCost) || 0,
            lineAmount: (Number(line.quantity) || 0) * (Number(line.unitCost) || 0),
            glAccountNo: line.glAccountNo || null,
          })),
        }),
      });
      const json = await readJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(json.error ?? "Failed to create PO");
      setForm({ poNumber: "", vendorId: "", currencyCode: "", orderDate: "", expectedDate: "", notes: "" });
      setLines([{ description: "", quantity: 1, unitCost: 0 }]);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create PO");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-white p-8 text-slate-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Purchase orders</p>
            <h1 className="mt-1 text-3xl font-semibold text-slate-900">PO register</h1>
            <p className="mt-2 text-sm text-slate-600">Capture approved POs and keep status aligned with invoices.</p>
          </div>
          <Button type="button" variant="outline" onClick={() => loadData()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        </header>

        {error && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{error}</div>}

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Recent POs</h2>
                <p className="text-sm text-slate-600">Click to view details, lines, and receipts.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{orders.length} total</span>
            </div>
            <div className="divide-y divide-slate-100">
              {loading && <div className="px-5 py-4 text-sm text-slate-600">Loading…</div>}
              {!loading && orders.length === 0 && (
                <div className="px-5 py-4 text-sm text-slate-600">No purchase orders yet. Create one on the right.</div>
              )}
              {!loading &&
                orders.map((po) => (
                  <Link
                    key={po.id}
                    href={`/purchase-orders/${po.id}`}
                    className="flex items-center justify-between px-5 py-4 transition hover:bg-slate-50"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-slate-900">PO {po.poNumber}</span>
                      <span className="text-xs text-slate-600">
                        {po.vendor?.name ?? "Unassigned"} · {po.status}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-slate-900">
                        {po.currencyCode ? `${po.currencyCode} ${currency(po.totalAmount)}` : currency(po.totalAmount)}
                      </div>
                      <div className="text-xs text-slate-600">{po._count?.lines ?? 0} lines</div>
                    </div>
                  </Link>
                ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">New PO</h2>
                <p className="text-sm text-slate-600">Fast capture with lines.</p>
              </div>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">Draft</span>
            </div>
            <div className="space-y-3 px-5 py-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">PO Number</Label>
                  <Input
                    value={form.poNumber}
                    onChange={(e) => setForm({ ...form, poNumber: e.target.value })}
                    placeholder="PO-12345"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Vendor</Label>
                  <Select value={form.vendorId} onValueChange={(value) => setForm({ ...form, vendorId: value })}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select vendor" />
                    </SelectTrigger>
                    <SelectContent>
                      {vendors.map((vendor) => (
                        <SelectItem key={vendor.id} value={vendor.id}>
                          {vendor.name} ({vendor.vendorNo})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Order date</Label>
                  <DatePicker
                    value={form.orderDate || null}
                    onChange={(next) => setForm({ ...form, orderDate: next ?? "" })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Expected date</Label>
                  <DatePicker
                    value={form.expectedDate || null}
                    onChange={(next) => setForm({ ...form, expectedDate: next ?? "" })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Currency</Label>
                  <Input
                    value={form.currencyCode}
                    onChange={(e) => setForm({ ...form, currencyCode: e.target.value })}
                    placeholder="USD"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Notes</Label>
                  <Input
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Internal notes"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase text-slate-600">
                  <span>Lines</span>
                  <Button type="button" variant="outline" size="sm" onClick={addLine}>
                    <Plus className="h-3 w-3" /> Line
                  </Button>
                </div>
                <div className="divide-y divide-slate-100">
                  {lines.map((line, idx) => (
                    <div key={idx} className="grid grid-cols-6 gap-2 px-3 py-2 text-xs">
                      <Input
                        value={line.description}
                        onChange={(e) => updateLine(idx, { description: e.target.value })}
                        placeholder="Description"
                        className="col-span-2 rounded-lg border border-slate-200 px-2 py-1"
                      />
                      <Input
                        type="number"
                        min="0"
                        value={line.quantity}
                        onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) })}
                        className="rounded-lg border border-slate-200 px-2 py-1"
                        placeholder="Qty"
                      />
                      <Input
                        type="number"
                        min="0"
                        value={line.unitCost}
                        onChange={(e) => updateLine(idx, { unitCost: Number(e.target.value) })}
                        className="rounded-lg border border-slate-200 px-2 py-1"
                        placeholder="Unit cost"
                      />
                      <Input
                        value={line.glAccountNo ?? ""}
                        onChange={(e) => updateLine(idx, { glAccountNo: e.target.value })}
                        className="rounded-lg border border-slate-200 px-2 py-1"
                        placeholder="G/L"
                      />
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-red-600"
                        onClick={() => removeLine(idx)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-sm font-semibold text-slate-800">
                  <span>Total</span>
                  <span>{currency(lineTotal)}</span>
                </div>
              </div>

              <Button type="button" onClick={submit} disabled={submitting} className="w-full gap-2">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save PO
              </Button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
