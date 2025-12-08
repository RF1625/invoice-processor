"use client";

import { useEffect, useMemo, useState } from "react";

type InvoiceItem = {
  description: string | null;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  glAccountNo?: string | null;
  dimensions?: Record<string, string>;
};

type InvoiceSummary = {
  vendorName: string | null;
  vendorAddress: string | null;
  gstNumber?: string | null;
  customerName: string | null;
  customerAddress: string | null;
  invoiceId: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  subTotal?: number | null;
  taxAmount?: number | null;
  taxRate?: number | null;
  amountDue?: number | null;
  invoiceTotal: number | null;
  currencyCode?: string | null;
  bankAccount?: string | null;
  paymentTerms?: string | null;
  items: InvoiceItem[];
  confidence?: number;
  pageRange?: number[];
  navVendorNo?: string | null;
};

type NavPreviewLine = {
  description: string;
  quantity: number;
  directUnitCost: number;
  amount: number;
  glAccountNo: string;
  dimensions?: Record<string, string>;
};

type NavPreview = {
  vendorNo: string;
  vendorInvoiceNo?: string;
  postingDate?: string;
  dueDate?: string;
  currencyCode?: string;
  dimensions?: Record<string, string>;
  lines: NavPreviewLine[];
};

type InvoiceRunLog = {
  id: string;
  status: string;
  fileName?: string | null;
  vendorName?: string | null;
  navVendorNo?: string | null;
  createdAt?: string;
  error?: string | null;
};

type InvoiceRunDetail = InvoiceRunLog & {
  payload?: InvoiceSummary | null;
  navPayload?: NavPreview | null;
  ruleApplications?: unknown;
};

type NavPostState = {
  status: "idle" | "posting" | "success" | "error";
  runId: string | null;
  message?: string | null;
  error?: string | null;
};

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [invoice, setInvoice] = useState<InvoiceSummary | null>(null);
  const [meta, setMeta] = useState<{ pagesAnalyzed: number; modelId?: string } | null>(null);
  const [navPreview, setNavPreview] = useState<NavPreview | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [runs, setRuns] = useState<InvoiceRunLog[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [selectedRun, setSelectedRun] = useState<InvoiceRunDetail | null>(null);
  const [selectedRunLoading, setSelectedRunLoading] = useState(false);
  const [navPostState, setNavPostState] = useState<NavPostState>({
    status: "idle",
    runId: null,
    message: null,
    error: null,
  });

  useEffect(() => {
    return () => {
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    };
  }, [filePreviewUrl]);

  const loadRuns = async () => {
    try {
      setRunsLoading(true);
      const res = await fetch("/api/invoice-runs");
      if (!res.ok) throw new Error("Failed to load runs");
      const data = await res.json();
      setRuns(data.runs ?? []);
    } catch (err) {
      console.error("Failed to load runs", err);
    } finally {
      setRunsLoading(false);
    }
  };

  useEffect(() => {
    loadRuns().catch(() => {});
  }, []);

  const loadRunDetail = async (id: string) => {
    try {
      setSelectedRunLoading(true);
      const res = await fetch(`/api/invoice-runs/${id}`);
      if (!res.ok) throw new Error("Failed to load run detail");
      const data = await res.json();
      setSelectedRun({
        id: data.id,
        status: data.status,
        fileName: data.fileName,
        vendorName: data.vendorName,
        navVendorNo: data.navVendorNo,
        createdAt: data.createdAt,
        error: data.error,
        payload: data.payload,
        navPayload: data.navPayload,
        ruleApplications: data.ruleApplications,
      });
    } catch (err) {
      console.error("Failed to load run detail", err);
      setSelectedRun(null);
    } finally {
      setSelectedRunLoading(false);
    }
  };

  const postRunToNav = async (id: string) => {
    setNavPostState({ status: "posting", runId: id, message: null, error: null });
    try {
      const res = await fetch(`/api/invoice-runs/${id}/post-to-nav`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to post to NAV");
      setNavPostState({
        status: "success",
        runId: id,
        message: json.message ?? "NAV accepted payload",
        error: null,
      });
      await loadRuns();
      if (selectedRun?.id === id) {
        await loadRunDetail(id);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to post to NAV";
      setNavPostState({ status: "error", runId: id, message: null, error: message });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Pick a PDF invoice to upload first.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setInvoice(null);
    setNavPreview(null);
    setMeta(null);
    setRunId(null);
    setNavPostState({ status: "idle", runId: null, message: null, error: null });

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/extract-invoice", { method: "POST", body: formData });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "Failed to process invoice");
        return;
      }

      setInvoice(json.invoice ?? null);
      setNavPreview(json.navPreview ?? null);
      setRunId(json.runId ?? null);
      setNavPostState({ status: "idle", runId: json.runId ?? null, message: null, error: null });
      setMeta({ pagesAnalyzed: json.pagesAnalyzed ?? 0, modelId: json.modelId });
      loadRuns().catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload invoice");
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasItems = useMemo(() => (invoice?.items?.length ?? 0) > 0, [invoice]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 text-slate-900 p-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-wide text-slate-500">Azure Document Intelligence</p>
            <h1 className="text-3xl font-semibold">Invoice extractor</h1>
          </div>
          <div className="flex items-center gap-3">
            {meta?.modelId && (
              <span className="rounded-full bg-white/70 px-4 py-2 text-xs font-medium text-slate-600 shadow-sm">
                Model: {meta.modelId}
              </span>
            )}
            <a
              href="/database"
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              View DB
            </a>
          </div>
        </header>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-md ring-1 ring-slate-100"
        >
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="file">
              Upload PDF invoice
            </label>
            <input
              id="file"
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => {
                const picked = e.target.files?.[0] ?? null;
                setFile(picked);
                setError(null);
                setShowOriginal(false);
                if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
                setFilePreviewUrl(picked ? URL.createObjectURL(picked) : null);
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
            />
            <p className="text-xs text-slate-500">We process the file server-side and never store it.</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-md transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isSubmitting && (
                <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-white" />
              )}
              {isSubmitting ? "Analyzing…" : "Upload & Analyze"}
            </button>
            {meta && (
              <span className="text-xs text-slate-600">
                Pages analyzed: {meta.pagesAnalyzed ?? 0}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {filePreviewUrl && (
              <button
                type="button"
                onClick={() => setShowOriginal((prev) => !prev)}
                className="text-sm font-medium text-slate-700 underline underline-offset-4"
              >
                {showOriginal ? "Hide original PDF" : "View original PDF"}
              </button>
            )}
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            )}
          </div>
        </form>

        {showOriginal && filePreviewUrl && (
          <section className="rounded-2xl bg-white p-4 shadow-md ring-1 ring-slate-100">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Original document</h2>
              <button
                type="button"
                onClick={() => setShowOriginal(false)}
                className="text-xs font-medium text-slate-600 underline underline-offset-4"
              >
                Close
              </button>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-100">
              <iframe src={filePreviewUrl} className="h-[720px] w-full" title="Original invoice preview" />
            </div>
          </section>
        )}

        {invoice && (
          <section className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-slate-100 lg:col-span-2 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-slate-900">Invoice details</h2>
                {invoice.currencyCode && (
                  <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                    Currency: {invoice.currencyCode}
                  </span>
                )}
              </div>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Detail label="Vendor" value={invoice.vendorName} hint={invoice.vendorAddress} />
                <Detail label="Customer" value={invoice.customerName} hint={invoice.customerAddress} />
                <Detail label="GST / Tax #" value={invoice.gstNumber ?? "Not found"} />
                <Detail label="Invoice #" value={invoice.invoiceId} />
                <Detail label="Invoice date" value={invoice.invoiceDate} />
                <Detail label="Due date" value={invoice.dueDate} />
                <Detail label="Subtotal" value={formatCurrency(invoice.subTotal, invoice.currencyCode)} />
                <Detail
                  label="GST"
                  value={
                    invoice.taxAmount != null
                      ? `${formatCurrency(invoice.taxAmount, invoice.currencyCode)}${invoice.taxRate ? ` (${invoice.taxRate}%)` : ""}`
                      : "Not found"
                  }
                />
                <Detail label="Total" value={formatCurrency(invoice.invoiceTotal, invoice.currencyCode)} />
                <Detail label="Amount due" value={formatCurrency(invoice.amountDue ?? invoice.invoiceTotal, invoice.currencyCode)} />
                <Detail label="Payment terms" value={invoice.paymentTerms ?? "Not found"} />
                <Detail label="Bank account" value={invoice.bankAccount ?? "Not found"} />
                <Detail
                  label="Confidence"
                  value={invoice.confidence != null ? `${(invoice.confidence * 100).toFixed(1)}%` : null}
                />
                <Detail
                  label="Pages"
                  value={invoice.pageRange && invoice.pageRange.length > 0 ? invoice.pageRange.join(", ") : null}
                />
              </dl>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-slate-100">
              <h2 className="text-lg font-semibold text-slate-900">Items</h2>
              {hasItems ? (
                <div className="mt-4 overflow-hidden rounded-xl border border-slate-100">
                  <div className="grid grid-cols-4 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase text-slate-600">
                    <span className="col-span-2">Description</span>
                    <span>Qty</span>
                    <span className="text-right">Amount</span>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {invoice.items.map((item, idx) => (
                      <li key={`${item.description ?? "item"}-${idx}`} className="grid grid-cols-4 px-3 py-3 text-sm">
                        <div className="col-span-2">
                          <p className="font-medium text-slate-800">{item.description ?? "—"}</p>
                          <p className="text-xs text-slate-500">
                            Unit: {item.unitPrice != null ? `$${item.unitPrice.toFixed(2)}` : "—"}
                            {item.glAccountNo ? ` • GL: ${item.glAccountNo}` : ""}
                            {item.dimensions ? ` • ${formatDimensions(item.dimensions)}` : ""}
                          </p>
                        </div>
                        <div className="text-slate-700">{item.quantity ?? "—"}</div>
                        <div className="text-right font-semibold text-slate-900">
                          {item.amount != null ? `$${item.amount.toFixed(2)}` : "—"}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-600">No line items detected on this invoice.</p>
              )}
            </div>
          </section>
        )}

        {navPreview && (
          <section className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-slate-100">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">NAV journal preview</h2>
              <div className="flex flex-col items-end gap-2 text-xs text-slate-600">
                <div>
                  Vendor: {navPreview.vendorNo}
                  {navPreview.vendorInvoiceNo ? ` • Vendor Invoice #: ${navPreview.vendorInvoiceNo}` : ""}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => runId && postRunToNav(runId)}
                    disabled={!runId || navPostState.status === "posting"}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                  >
                    {navPostState.status === "posting" && navPostState.runId === runId ? "Posting..." : "Send to NAV"}
                  </button>
                  {navPostState.runId === runId && navPostState.status === "success" && (
                    <span className="text-green-700">{navPostState.message ?? "Sent"}</span>
                  )}
                  {navPostState.runId === runId && navPostState.status === "error" && (
                    <span className="text-red-600">{navPostState.error}</span>
                  )}
                </div>
              </div>
            </div>

            <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3 text-sm text-slate-700">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Posting date</dt>
                <dd className="mt-1">{navPreview.postingDate ?? "Not set"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Due date</dt>
                <dd className="mt-1">{navPreview.dueDate ?? "Not set"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Header dimensions</dt>
                <dd className="mt-1">{formatDimensions(navPreview.dimensions)}</dd>
              </div>
            </dl>

            <div className="mt-4 overflow-hidden rounded-xl border border-slate-100">
              <div className="grid grid-cols-5 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase text-slate-600">
                <span className="col-span-2">Description</span>
                <span>GL Account</span>
                <span className="text-center">Qty</span>
                <span className="text-right">Amount</span>
              </div>
              <ul className="divide-y divide-slate-100">
                {navPreview.lines.map((line, idx) => (
                  <li key={`${line.description}-${idx}`} className="grid grid-cols-5 px-3 py-3 text-sm">
                    <div className="col-span-2">
                      <p className="font-medium text-slate-800">{line.description}</p>
                      <p className="text-xs text-slate-500">
                        Unit: ${line.directUnitCost.toFixed(2)}
                        {line.dimensions ? ` • ${formatDimensions(line.dimensions)}` : ""}
                      </p>
                    </div>
                    <div className="text-slate-700">{line.glAccountNo}</div>
                    <div className="text-center text-slate-700">{line.quantity}</div>
                    <div className="text-right font-semibold text-slate-900">
                      {line.amount != null ? `$${line.amount.toFixed(2)}` : "—"}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        <section className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-slate-100">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Recent runs</h2>
            <button
              type="button"
              onClick={() => loadRuns()}
              disabled={runsLoading}
              className="text-sm font-medium text-slate-700 underline underline-offset-4 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              {runsLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-100">
            <div className="grid grid-cols-6 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase text-slate-600">
              <span>Status</span>
              <span>Vendor</span>
              <span>Vendor #</span>
              <span>File</span>
              <span className="text-right">When</span>
              <span className="text-right">Action</span>
            </div>
            <ul className="divide-y divide-slate-100">
              {runs.length === 0 && (
                <li className="px-3 py-3 text-sm text-slate-500">No runs logged yet.</li>
              )}
              {runs.map((run) => (
                <li key={run.id} className="grid grid-cols-6 px-3 py-3 text-sm">
                  <div className="font-medium text-slate-900">
                    {run.status}
                    {run.error ? <span className="text-red-600"> • error</span> : null}
                  </div>
                  <div className="text-slate-700">{run.vendorName ?? "—"}</div>
                  <div className="text-slate-700">{run.navVendorNo ?? "—"}</div>
                  <div className="text-slate-700 truncate">{run.fileName ?? "—"}</div>
                  <div className="text-right text-slate-600 text-xs">
                    {run.createdAt ? new Date(run.createdAt).toLocaleString() : "—"}
                  </div>
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => loadRunDetail(run.id)}
                      className="text-xs font-medium text-slate-700 underline underline-offset-4"
                    >
                      {selectedRunLoading && selectedRun?.id === run.id ? "Loading..." : "View"}
                    </button>
                  </div>
                  {run.error ? (
                    <div className="col-span-6 text-xs text-red-600">Error: {run.error}</div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {selectedRun && (
          <section className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-slate-100 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Run detail</h2>
                <div className="text-xs text-slate-600">
                  {selectedRun.fileName ?? "No file"} • {selectedRun.status}
                </div>
              </div>
              {selectedRun.navPayload ? (
                <div className="flex flex-col items-end gap-2">
                  <button
                    type="button"
                    onClick={() => postRunToNav(selectedRun.id)}
                    disabled={navPostState.status === "posting"}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                  >
                    {navPostState.status === "posting" && navPostState.runId === selectedRun.id
                      ? "Posting..."
                      : "Send to NAV"}
                  </button>
                  {navPostState.runId === selectedRun.id && navPostState.status === "success" && (
                    <span className="text-xs text-green-700">{navPostState.message ?? "Sent"}</span>
                  )}
                  {navPostState.runId === selectedRun.id && navPostState.status === "error" && (
                    <span className="text-xs text-red-600">{navPostState.error}</span>
                  )}
                </div>
              ) : null}
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Invoice payload</div>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-slate-800">
                  {JSON.stringify(selectedRun.payload ?? {}, null, 2)}
                </pre>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">NAV payload</div>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-slate-800">
                  {JSON.stringify(selectedRun.navPayload ?? {}, null, 2)}
                </pre>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rule applications</div>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-slate-800">
                  {JSON.stringify(selectedRun.ruleApplications ?? {}, null, 2)}
                </pre>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

type DetailProps = {
  label: string;
  value: string | null | number;
  hint?: string | null;
};

function Detail({ label, value, hint }: DetailProps) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-slate-900">{value ?? "Not found"}</dd>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function formatDimensions(dimensions?: Record<string, string>) {
  if (!dimensions) return "—";
  const entries = Object.entries(dimensions);
  if (entries.length === 0) return "—";
  return entries.map(([code, value]) => `${code}: ${value}`).join(" • ");
}

function formatCurrency(amount: number | null | undefined, currencyCode?: string | null) {
  if (amount == null) return "Not found";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currencyCode ?? "USD",
      currencyDisplay: "symbol",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}
