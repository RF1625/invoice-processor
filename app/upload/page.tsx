"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ApiResult = {
  invoice?: {
    vendorName?: string | null;
    invoiceId?: string | null;
    invoiceDate?: string | null;
    dueDate?: string | null;
    amountDue?: number | null;
    invoiceTotal?: number | null;
    currencyCode?: string | null;
  };
  navPreview?: unknown;
  ruleApplications?: unknown;
  runId?: string;
  pagesAnalyzed?: number;
  modelId?: string;
  navValidationError?: string | null;
  analysisResult?: unknown;
};

export default function UploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);
  const isFileTooLarge = Boolean(error && error.toLowerCase().includes("too large"));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Choose a PDF or image to upload.");
      return;
    }
    setLoading(true);
    setError(null);
    setErrorDetails(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/extract-invoice", {
        method: "POST",
        body: formData,
      });

      if (res.status === 401) {
        router.push("/login?redirect=/upload");
        return;
      }

      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Upload failed");
        setErrorDetails(json.details ?? null);
        return;
      }
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-white p-8 text-slate-900">
      <div className="mx-auto flex max-w-4xl flex-col gap-8">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Manual upload</p>
          <h1 className="text-3xl font-semibold text-slate-900">Upload an invoice</h1>
          <p className="text-sm text-slate-600">
            Send a PDF or image to the analyzer. We&apos;ll extract header and lines, run rules, and give you a NAV preview.
          </p>
        </header>

        <section className="rounded-2xl bg-white p-6 ring-1 ring-slate-100">
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center transition hover:border-slate-300 hover:bg-slate-100">
              <UploadCloud className="h-10 w-10 text-slate-500" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">Drop a file or click to browse</p>
                <p className="text-xs text-slate-600">PDF or image, up to 10MB.</p>
              </div>
              <Input
                type="file"
                accept=".pdf,image/*"
                className="sr-only"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {file && <p className="text-sm text-slate-700">Selected: {file.name}</p>}
            </label>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {loading ? "Analyzing…" : "Analyze invoice"}
              </Button>
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-sm font-medium text-slate-700"
                onClick={() => {
                  setFile(null);
                  setResult(null);
                  setError(null);
                  setErrorDetails(null);
                }}
              >
                Reset
              </Button>
            </div>
          </form>

          {error && (
            <div className="mt-4 space-y-2">
              <div className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
              {isFileTooLarge ? (
                <div className="text-xs text-amber-900">
                  Tip: compress the PDF and try again (for example{" "}
                  <a
                    href="https://www.ilovepdf.com/compress_pdf"
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold underline-offset-4 hover:underline"
                  >
                    ilovepdf.com/compress_pdf
                  </a>
                  ), or re-export at a lower DPI.
                </div>
              ) : null}
              {errorDetails ? (
                <details className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <summary className="cursor-pointer font-semibold text-amber-900">Error details</summary>
                  <pre className="mt-2 whitespace-pre-wrap">{errorDetails}</pre>
                </details>
              ) : null}
            </div>
          )}

          {result && (
            <div className="mt-6 space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-800">
                <CheckCircle2 className="h-4 w-4" />
                Processed successfully
                {result.pagesAnalyzed ? <span className="text-emerald-700">({result.pagesAnalyzed} page(s))</span> : null}
              </div>
              {result.navValidationError ? (
                <div className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  <AlertCircle className="h-4 w-4" />
                  {result.navValidationError}
                </div>
              ) : null}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label="Vendor" value={result.invoice?.vendorName} />
                  <Field label="Invoice #" value={result.invoice?.invoiceId} />
                  <Field label="Invoice date" value={result.invoice?.invoiceDate} />
                  <Field label="Due date" value={result.invoice?.dueDate} />
                  <Field
                    label="Total"
                    value={
                      result.invoice?.invoiceTotal != null
                        ? `${result.invoice.currencyCode ?? ""} ${Number(result.invoice.invoiceTotal).toFixed(2)}`
                        : null
                    }
                  />
                  <Field
                    label="Amount due"
                    value={
                      result.invoice?.amountDue != null
                        ? `${result.invoice.currencyCode ?? ""} ${Number(result.invoice.amountDue).toFixed(2)}`
                        : null
                    }
                  />
                </div>
                {result.runId && (
                  <p className="mt-3 text-xs text-slate-600">Run ID: {result.runId}</p>
                )}
              </div>
              {result.navPreview ? (
                <details className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-800">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-900">NAV preview payload</summary>
                  <pre className="mt-2 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-50">
                    {JSON.stringify(result.navPreview, null, 2)}
                  </pre>
                </details>
              ) : null}
              <details className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-800">
                <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                  Full analyzer response (JSON)
                </summary>
                <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-50">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value ?? "—"}</p>
    </div>
  );
}
