"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Save, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const currency = (value?: number | string | null, code?: string | null) => {
  const num = typeof value === "string" ? Number(value) : value ?? 0;
  if (Number.isNaN(num)) return "-";
  const formatted = num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return code ? `${code} ${formatted}` : formatted;
};

type Line = {
  id: string;
  lineNo: number;
  description?: string | null;
  quantity: number;
  unitCost: number;
  lineAmount: number;
  receivedQuantity: number;
  invoicedQuantity: number;
  glAccountNo?: string | null;
};

type Receipt = {
  id: string;
  purchaseOrderLineId?: string | null;
  quantity: number;
  receiptDate?: string | null;
  note?: string | null;
};

type PurchaseOrder = {
  id: string;
  poNumber: string;
  status: string;
  vendor?: { name: string } | null;
  currencyCode?: string | null;
  orderDate?: string | null;
  expectedDate?: string | null;
  notes?: string | null;
  lines: Line[];
  receipts: Receipt[];
};

type ReceiptForm = {
  purchaseOrderLineId: string;
  quantity: number;
  receiptDate: string;
  note: string;
};

export default function PurchaseOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const [purchaseOrder, setPurchaseOrder] = useState<PurchaseOrder | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingLines, setSavingLines] = useState(false);
  const [receiptForm, setReceiptForm] = useState<ReceiptForm>({ purchaseOrderLineId: "", quantity: 0, receiptDate: "", note: "" });
  const [savingReceipt, setSavingReceipt] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/purchase-orders/${params.id}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load PO");
      const normalizedLines: Line[] = (json.purchaseOrder.lines ?? []).map((line: Line) => ({
        ...line,
        quantity: Number(line.quantity) || 0,
        unitCost: Number(line.unitCost) || 0,
        lineAmount: Number(line.lineAmount) || 0,
        receivedQuantity: Number(line.receivedQuantity) || 0,
        invoicedQuantity: Number(line.invoicedQuantity) || 0,
      }));
      setPurchaseOrder({ ...json.purchaseOrder, lines: normalizedLines });
      setLines(normalizedLines);
      if (normalizedLines.length) {
        setReceiptForm((prev) => ({ ...prev, purchaseOrderLineId: normalizedLines[0].id }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(() => {});
  }, [params.id]);

  const updateLine = (id: string, patch: Partial<Line>) => {
    setLines((prev) => prev.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  };

  const lineTotals = useMemo(() => {
    const total = lines.reduce((sum, l) => sum + (l.lineAmount ?? 0), 0);
    const received = lines.reduce((sum, l) => sum + (l.receivedQuantity ?? 0) * (l.unitCost ?? 0), 0);
    const invoiced = lines.reduce((sum, l) => sum + (l.invoicedQuantity ?? 0) * (l.unitCost ?? 0), 0);
    return { total, received, invoiced };
  }, [lines]);

  const saveLines = async () => {
    setSavingLines(true);
    setError(null);
    try {
      const res = await fetch(`/api/purchase-orders/${params.id}/lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: lines.map((line, idx) => ({
            id: line.id,
            lineNo: idx + 1,
            description: line.description,
            quantity: Number(line.quantity) || 0,
            unitCost: Number(line.unitCost) || 0,
            lineAmount: (Number(line.quantity) || 0) * (Number(line.unitCost) || 0),
            glAccountNo: line.glAccountNo ?? null,
            receivedQuantity: Number(line.receivedQuantity) || 0,
            invoicedQuantity: Number(line.invoicedQuantity) || 0,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save lines");
      const normalizedLines: Line[] = (json.purchaseOrder?.lines ?? []).map((line: Line) => ({
        ...line,
        quantity: Number(line.quantity) || 0,
        unitCost: Number(line.unitCost) || 0,
        lineAmount: Number(line.lineAmount) || 0,
        receivedQuantity: Number(line.receivedQuantity) || 0,
        invoicedQuantity: Number(line.invoicedQuantity) || 0,
      }));
      setPurchaseOrder({ ...json.purchaseOrder, lines: normalizedLines });
      setLines(normalizedLines);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save lines");
    } finally {
      setSavingLines(false);
    }
  };

  const addReceipt = async () => {
    if (!receiptForm.purchaseOrderLineId) {
      setError("Choose a line for the receipt");
      return;
    }
    setSavingReceipt(true);
    setError(null);
    try {
      const res = await fetch(`/api/purchase-orders/${params.id}/receipts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchaseOrderLineId: receiptForm.purchaseOrderLineId,
          quantity: Number(receiptForm.quantity) || 0,
          receiptDate: receiptForm.receiptDate,
          note: receiptForm.note,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to add receipt");
      const normalizedLines: Line[] = (json.purchaseOrder?.lines ?? []).map((line: Line) => ({
        ...line,
        quantity: Number(line.quantity) || 0,
        unitCost: Number(line.unitCost) || 0,
        lineAmount: Number(line.lineAmount) || 0,
        receivedQuantity: Number(line.receivedQuantity) || 0,
        invoicedQuantity: Number(line.invoicedQuantity) || 0,
      }));
      setPurchaseOrder({ ...json.purchaseOrder, lines: normalizedLines });
      setLines(normalizedLines);
      setReceiptForm({ purchaseOrderLineId: normalizedLines[0]?.id ?? "", quantity: 0, receiptDate: "", note: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add receipt");
    } finally {
      setSavingReceipt(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-white p-8 text-slate-900">
        <div className="mx-auto max-w-5xl text-center text-sm text-slate-600">Loading PO…</div>
      </main>
    );
  }

  if (!purchaseOrder) {
    return (
      <main className="min-h-screen bg-white p-8 text-slate-900">
        <div className="mx-auto max-w-5xl text-sm text-red-700">{error ?? "Purchase order not found"}</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white p-8 text-slate-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/purchase-orders" className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50">
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-slate-500">PO Detail</p>
              <h1 className="text-2xl font-semibold text-slate-900">PO {purchaseOrder.poNumber}</h1>
              <p className="text-sm text-slate-600">
                {purchaseOrder.vendor?.name ?? "Unassigned"} · {purchaseOrder.status}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200">
            {purchaseOrder.currencyCode ? `${purchaseOrder.currencyCode}` : ""} Total {currency(lineTotals.total)}
          </div>
        </div>

        {error && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{error}</div>}

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-3">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Lines</h2>
                  <p className="text-sm text-slate-600">Edit line quantities, costs, and G/L assignment.</p>
                </div>
                <Button type="button" onClick={saveLines} disabled={savingLines} className="gap-2">
                  {savingLines ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save lines
                </Button>
              </div>
              <div className="divide-y divide-slate-100">
                {lines.map((line) => (
                  <div key={line.id} className="grid grid-cols-8 gap-2 px-4 py-3 text-xs">
                    <Input
                      value={line.description ?? ""}
                      onChange={(e) => updateLine(line.id, { description: e.target.value })}
                      className="col-span-2 rounded-lg border border-slate-200 px-2 py-1"
                      placeholder="Description"
                    />
                    <Input
                      type="number"
                      value={line.quantity}
                      onChange={(e) => updateLine(line.id, { quantity: Number(e.target.value) })}
                      className="rounded-lg border border-slate-200 px-2 py-1"
                      placeholder="Qty"
                    />
                    <Input
                      type="number"
                      value={line.unitCost}
                      onChange={(e) => updateLine(line.id, { unitCost: Number(e.target.value) })}
                      className="rounded-lg border border-slate-200 px-2 py-1"
                      placeholder="Unit cost"
                    />
                    <Input
                      type="number"
                      value={line.receivedQuantity}
                      onChange={(e) => updateLine(line.id, { receivedQuantity: Number(e.target.value) })}
                      className="rounded-lg border border-slate-200 px-2 py-1"
                      placeholder="Received"
                    />
                    <Input
                      type="number"
                      value={line.invoicedQuantity}
                      onChange={(e) => updateLine(line.id, { invoicedQuantity: Number(e.target.value) })}
                      className="rounded-lg border border-slate-200 px-2 py-1"
                      placeholder="Invoiced"
                    />
                    <Input
                      value={line.glAccountNo ?? ""}
                      onChange={(e) => updateLine(line.id, { glAccountNo: e.target.value })}
                      className="rounded-lg border border-slate-200 px-2 py-1"
                      placeholder="G/L"
                    />
                    <div className="flex flex-col justify-center text-right text-slate-700">
                      <span className="text-sm font-semibold">{currency(line.quantity * line.unitCost, purchaseOrder.currencyCode)}</span>
                      <span className="text-[10px] text-slate-500">Line {line.lineNo}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3 border-t border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">
                <div>Total: {currency(lineTotals.total, purchaseOrder.currencyCode)}</div>
                <div>Received: {currency(lineTotals.received, purchaseOrder.currencyCode)}</div>
                <div className="text-right">Invoiced: {currency(lineTotals.invoiced, purchaseOrder.currencyCode)}</div>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Receipts</h3>
                  <p className="text-sm text-slate-600">Log goods receipts for 3-way match.</p>
                </div>
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="divide-y divide-slate-100">
                {purchaseOrder.receipts?.length === 0 && <div className="px-4 py-3 text-sm text-slate-600">No receipts yet.</div>}
                {purchaseOrder.receipts?.map((receipt) => (
                  <div key={receipt.id} className="grid grid-cols-4 gap-2 px-4 py-3 text-sm text-slate-700">
                    <span>{receipt.receiptDate ? new Date(receipt.receiptDate).toLocaleDateString() : "—"}</span>
                    <span>
                      Line {purchaseOrder.lines.find((l) => l.id === receipt.purchaseOrderLineId)?.lineNo ?? "?"}
                    </span>
                    <span>{receipt.quantity}</span>
                    <span className="truncate text-slate-500">{receipt.note ?? ""}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-4 py-3">
                <h3 className="text-lg font-semibold text-slate-900">Add receipt</h3>
                <p className="text-sm text-slate-600">Update quantities received.</p>
              </div>
              <div className="space-y-3 px-4 py-3 text-sm">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Line</Label>
                  <Select
                    value={receiptForm.purchaseOrderLineId}
                    onValueChange={(value) => setReceiptForm({ ...receiptForm, purchaseOrderLineId: value })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select line" />
                    </SelectTrigger>
                    <SelectContent>
                      {lines.map((line) => (
                        <SelectItem key={line.id} value={line.id}>
                          Line {line.lineNo} · {line.description ?? "(no desc)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Quantity</Label>
                  <Input
                    type="number"
                    value={receiptForm.quantity}
                    onChange={(e) => setReceiptForm({ ...receiptForm, quantity: Number(e.target.value) })}
                    placeholder="e.g. 10"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Receipt date</Label>
                  <DatePicker
                    value={receiptForm.receiptDate || null}
                    onChange={(next) => setReceiptForm({ ...receiptForm, receiptDate: next ?? "" })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Note</Label>
                  <Input
                    value={receiptForm.note}
                    onChange={(e) => setReceiptForm({ ...receiptForm, note: e.target.value })}
                    placeholder="Optional"
                  />
                </div>
                <Button type="button" onClick={addReceipt} disabled={savingReceipt} className="w-full gap-2">
                  {savingReceipt ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Log receipt
                </Button>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-4 py-3">
                <h3 className="text-lg font-semibold text-slate-900">Meta</h3>
                <p className="text-sm text-slate-600">Dates and notes.</p>
              </div>
              <div className="space-y-2 px-4 py-3 text-sm text-slate-700">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Order date</span>
                  <span className="font-semibold">{purchaseOrder.orderDate ? new Date(purchaseOrder.orderDate).toLocaleDateString() : "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Expected date</span>
                  <span className="font-semibold">{purchaseOrder.expectedDate ? new Date(purchaseOrder.expectedDate).toLocaleDateString() : "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Status</span>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-800">{purchaseOrder.status}</span>
                </div>
                <div className="flex items-start justify-between">
                  <span className="text-slate-600">Notes</span>
                  <span className="max-w-[60%] text-right text-slate-800">{purchaseOrder.notes ?? "—"}</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
