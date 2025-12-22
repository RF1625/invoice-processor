"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Mail, RefreshCw, Upload } from "lucide-react";
import { readCache, writeCache } from "@/lib/client-cache";

type Run = {
  id: string;
  status: string;
  fileName?: string | null;
  vendorName?: string | null;
  navVendorNo?: string | null;
  createdAt?: string;
  error?: string | null;
};

const CACHE_KEY = "dashboard-runs-v1";
const CACHE_TTL_MS = 30_000;

const statusLabel = (status: string) => {
  if (!status) return "unknown";
  if (status.toLowerCase().includes("error") || status.toLowerCase().includes("fail")) return "error";
  if (status.toLowerCase().includes("processed")) return "processed";
  return status.toLowerCase();
};

export default function DashboardPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, startRefresh] = useTransition();
  const shouldRefresh = useMemo(
    () => lastUpdated == null || Date.now() - lastUpdated > CACHE_TTL_MS,
    [lastUpdated],
  );

  const loadRuns = useCallback(() => {
    startRefresh(async () => {
      try {
        setError(null);
        const res = await fetch("/api/invoice-runs", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load activity");
        const entry = writeCache<Run[]>(CACHE_KEY, json.runs ?? []);
        setRuns(entry.data);
        setIsReady(true);
        setLastUpdated(entry.updatedAt);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load activity");
        setIsReady(true);
      }
    });
  }, [startRefresh]);

  useEffect(() => {
    const cachedEntry = readCache<Run[]>(CACHE_KEY);
    if (cachedEntry) {
      setRuns(cachedEntry.data);
      setLastUpdated(cachedEntry.updatedAt);
    }
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!isReady) return;
    if (!shouldRefresh) return;
    loadRuns();
  }, [isReady, shouldRefresh, loadRuns]);

  const stats = useMemo(() => {
    const processed = runs.filter((r) => statusLabel(r.status) === "processed").length;
    const errors = runs.filter((r) => statusLabel(r.status) === "error").length;
    const total = runs.length;
    const lastRun = runs[0]?.createdAt ? new Date(runs[0].createdAt) : null;
    return { processed, errors, total, lastRun };
  }, [runs]);
  const contentReady = isReady || runs.length > 0;

  return (
    <main className="min-h-screen bg-white p-8 text-slate-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Ops dashboard</p>
            <h1 className="mt-1 text-3xl font-semibold text-slate-900">Invoice automation overview</h1>
            <p className="mt-2 text-sm text-slate-600">
              Track recent invoice ingests, spot errors quickly, and connect inboxes to keep data flowing.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/settings/inbox"
              className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              <Mail className="h-4 w-4" />
              Connect email
            </Link>
            <Link
              href="/upload"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
            >
              <Upload className="h-4 w-4" />
              Manual upload
            </Link>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <StatCard
            title="Connected inboxes"
            value="Email"
            hint="Manage under Settings → Connect inbox"
            accent="bg-emerald-100 text-emerald-800"
          />
          <StatCard
            title="Processed this week"
            value={String(stats.processed || 0)}
            hint="Based on recent runs"
            accent="bg-blue-100 text-blue-800"
          />
          <StatCard
            title="Issues to review"
            value={String(stats.errors || 0)}
            hint="Errors in recent ingests"
            accent="bg-amber-100 text-amber-800"
          />
          <StatCard
            title="Last run"
            value={stats.lastRun ? stats.lastRun.toLocaleString() : "—"}
            hint={`${stats.total} recent runs`}
            accent="bg-slate-100 text-slate-800"
          />
        </section>

        <section className="rounded-2xl bg-white p-6 ring-1 ring-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Recent activity</h2>
              <p className="text-sm text-slate-600">Latest invoice ingests and NAV previews.</p>
            </div>
            <button
              type="button"
              onClick={loadRuns}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {error && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {error}
            </div>
          )}

          <div className="mt-4 overflow-hidden rounded-xl border border-slate-100">
            <div className="grid grid-cols-6 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase text-slate-600">
              <span className="col-span-2">File</span>
              <span>Vendor</span>
              <span>Status</span>
              <span>Created</span>
              <span>Notes</span>
            </div>
            <div className="divide-y divide-slate-100">
              {!contentReady && (
                <div className="px-3 py-4 text-sm text-slate-600">Loading recent runs...</div>
              )}
              {contentReady && runs.length === 0 && !isRefreshing && (
                <div className="px-3 py-4 text-sm text-slate-600">No runs yet. Connect email to start ingesting.</div>
              )}
              {runs.length > 0 &&
                runs.map((run) => (
                  <div key={run.id} className="grid grid-cols-6 items-center px-3 py-3 text-sm">
                    <div className="col-span-2 truncate font-medium text-slate-900">
                      {run.fileName ?? "Email attachment"}
                    </div>
                    <div className="truncate text-slate-700">
                      {run.vendorName ?? run.navVendorNo ?? "Unknown"}
                    </div>
                    <div className="flex items-center gap-2 text-slate-700">
                      {statusLabel(run.status) === "processed" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : statusLabel(run.status) === "error" ? (
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                      ) : null}
                      <span className="capitalize">{statusLabel(run.status)}</span>
                    </div>
                    <div className="text-slate-600">
                      {run.createdAt ? new Date(run.createdAt).toLocaleString() : "—"}
                    </div>
                    <div className="truncate text-slate-600">
                      {run.error ? run.error : "—"}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function StatCard({
  title,
  value,
  hint,
  accent,
}: {
  title: string;
  value: string;
  hint: string;
  accent: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-100">
      <p className="text-sm text-slate-600">{title}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-3xl font-semibold text-slate-900">{value}</span>
      </div>
      <span className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${accent}`}>{hint}</span>
    </div>
  );
}
