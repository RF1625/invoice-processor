"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { VendorManager, RuleManager, GlAccountManager, DimensionManager, InvoiceApprovalPanel } from "./forms";
import type { MatchType } from "@prisma/client";

type VendorInput = {
  id: string;
  vendorNo: string;
  name: string;
  gstNumber?: string | null;
  defaultCurrency?: string | null;
  defaultDimensions?: Record<string, string> | null;
  active: boolean;
};

type GlAccountInput = { id: string; no: string; name: string; type?: string | null };
type DimensionInput = { id: string; code: string; valueCode: string; valueName: string; active: boolean };
type RuleInput = {
  id: string;
  vendorId: string;
  priority: number;
  matchType: MatchType;
  matchValue?: string | null;
  glAccountNo?: string | null;
  dimensionOverrides?: Record<string, string> | null;
  active: boolean;
  comment?: string | null;
  vendorName?: string | null;
};
type RunInput = {
  id: string;
  status: string;
  vendorName?: string | null;
  vendorNo?: string | null;
  fileName?: string | null;
  createdAt?: string | null;
  error?: string | null;
};
type InvoiceApprovalInput = { id: string; status: string; comment?: string | null; actedAt?: string | null; createdAt: string };
type InvoiceInput = {
  id: string;
  invoiceNo?: string | null;
  vendorName?: string | null;
  status: string;
  currencyCode?: string | null;
  totalAmount: number;
  approvals: InvoiceApprovalInput[];
};

type DatabaseSnapshot = {
  vendors: VendorInput[];
  glAccounts: GlAccountInput[];
  dimensions: DimensionInput[];
  rules: RuleInput[];
  runs: RunInput[];
  invoices: InvoiceInput[];
};

const STORAGE_KEY = "db-cache-v1";
let memoryCache: DatabaseSnapshot | null = null;

const emptySnapshot: DatabaseSnapshot = {
  vendors: [],
  glAccounts: [],
  dimensions: [],
  rules: [],
  runs: [],
  invoices: [],
};

export default function DatabasePage() {
  const router = useRouter();
  const [data, setData] = useState<DatabaseSnapshot>(memoryCache ?? emptySnapshot);
  const [isReady, setIsReady] = useState(Boolean(memoryCache));
  const [isRefreshing, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Load from sessionStorage for instant re-entry across navigations or reloads.
  useEffect(() => {
    if (memoryCache) return;
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as DatabaseSnapshot;
        memoryCache = parsed;
        setData(parsed);
        setIsReady(true);
      } catch {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  // Initial fetch if no cache yet.
  useEffect(() => {
    if (isReady) return;
    void refreshData();
  }, [isReady]);

  const refreshData = async () => {
    startTransition(async () => {
      try {
        setError(null);
        const [vendorsRes, glRes, dimRes, ruleRes, runRes, invoiceRes] = await Promise.all([
          fetch("/api/vendors", { cache: "no-store" }),
          fetch("/api/gl-accounts", { cache: "no-store" }),
          fetch("/api/dimensions", { cache: "no-store" }),
          fetch("/api/vendor-rules", { cache: "no-store" }),
          fetch("/api/invoice-runs", { cache: "no-store" }),
          fetch("/api/invoices?take=10", { cache: "no-store" }),
        ]);

        if (vendorsRes.status === 401 || glRes.status === 401 || dimRes.status === 401 || ruleRes.status === 401 || runRes.status === 401 || invoiceRes.status === 401) {
          router.push("/login?redirect=/database");
          return;
        }

        const [vendorsJson, glJson, dimJson, ruleJson, runJson, invoiceJson] = await Promise.all([
          vendorsRes.json(),
          glRes.json(),
          dimRes.json(),
          ruleRes.json(),
          runRes.json(),
          invoiceRes.json(),
        ]);

        if (!vendorsRes.ok) throw new Error(vendorsJson.error ?? "Failed to load vendors");
        if (!glRes.ok) throw new Error(glJson.error ?? "Failed to load GL accounts");
        if (!dimRes.ok) throw new Error(dimJson.error ?? "Failed to load dimensions");
        if (!ruleRes.ok) throw new Error(ruleJson.error ?? "Failed to load rules");
        if (!runRes.ok) throw new Error(runJson.error ?? "Failed to load runs");
        if (!invoiceRes.ok) throw new Error(invoiceJson.error ?? "Failed to load invoices");

        const next: DatabaseSnapshot = {
          vendors: (vendorsJson.vendors ?? []).map((v: any) => ({
            id: v.id,
            vendorNo: v.vendorNo,
            name: v.name,
            gstNumber: v.gstNumber,
            defaultCurrency: v.defaultCurrency,
            defaultDimensions: v.defaultDimensions ?? null,
            active: v.active,
          })),
          glAccounts: (glJson.glAccounts ?? []).map((g: any) => ({
            id: g.id,
            no: g.no,
            name: g.name,
            type: g.type,
          })),
          dimensions: (dimJson.dimensions ?? []).map((d: any) => ({
            id: d.id,
            code: d.code,
            valueCode: d.valueCode,
            valueName: d.valueName,
            active: d.active,
          })),
          rules: (ruleJson.rules ?? []).map((r: any) => ({
            id: r.id,
            vendorId: r.vendorId,
            priority: r.priority,
            matchType: r.matchType as MatchType,
            matchValue: r.matchValue,
            glAccountNo: r.glAccountNo,
            dimensionOverrides: r.dimensionOverrides ?? null,
            active: r.active,
            comment: r.comment,
            vendorName: r.vendor?.name ?? null,
          })),
          runs: (runJson.runs ?? []).map((r: any) => ({
            id: r.id,
            status: r.status,
            vendorName: r.vendorName ?? null,
            vendorNo: r.vendorNo ?? null,
            fileName: r.fileName ?? null,
            createdAt: r.createdAt ?? null,
            error: r.error ?? null,
          })),
          invoices: (invoiceJson.invoices ?? []).map((inv: any) => ({
            id: inv.id,
            invoiceNo: inv.invoiceNo,
            vendorName: inv.vendor?.name ?? inv.vendorName ?? null,
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
          })),
        };

        memoryCache = next;
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        setData(next);
        setIsReady(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      }
    });
  };

  const contentReady = useMemo(() => isReady || data !== emptySnapshot, [isReady, data]);

  return (
    <main className="min-h-screen bg-white p-8 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Master data (Supabase/Postgres)</p>
            <h1 className="text-2xl font-semibold">Vendors, G/L accounts & rules</h1>
          </div>
          <div className="flex items-center gap-3">
            {isRefreshing && <span className="text-xs text-slate-500">Refreshing…</span>}
            <button
              type="button"
              onClick={refreshData}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-70"
              disabled={isRefreshing}
            >
              Refresh
            </button>
            <Link
              href="/"
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Back to app
            </Link>
          </div>
        </header>

        {error && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {error}
          </div>
        )}

        {!contentReady ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Loading cached data…</div>
        ) : (
          <>
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">Vendors</h2>
                <span className="text-xs text-slate-600">{data.vendors.length} total</span>
              </div>
              <VendorManager vendors={data.vendors} />
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">G/L Accounts</h2>
                <span className="text-xs text-slate-600">{data.glAccounts.length} entries</span>
              </div>
              <GlAccountManager glAccounts={data.glAccounts} />
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Dimensions</h2>
                <span className="text-xs text-slate-600">{data.dimensions.length} values</span>
              </div>
              <DimensionManager dimensions={data.dimensions} />
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Vendor rules</h2>
                <span className="text-xs text-slate-600">{data.rules.length} rules</span>
              </div>
              <RuleManager vendors={data.vendors} glAccounts={data.glAccounts} rules={data.rules} />
            </section>

            <section className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Recent runs</h2>
                <span className="text-xs text-slate-600">Last {data.runs.length}</span>
              </div>
              <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Vendor</th>
                      <th className="px-3 py-2 text-left">Vendor #</th>
                      <th className="px-3 py-2 text-left">File</th>
                      <th className="px-3 py-2 text-left">When</th>
                      <th className="px-3 py-2 text-left">Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.runs.map((r) => (
                      <tr key={r.id}>
                        <td className="px-3 py-2">{r.status}</td>
                        <td className="px-3 py-2">{r.vendorName ?? "—"}</td>
                        <td className="px-3 py-2">{r.vendorNo ?? "—"}</td>
                        <td className="px-3 py-2">{r.fileName ?? "—"}</td>
                        <td className="px-3 py-2 text-xs text-slate-600">{r.createdAt ? new Date(r.createdAt).toLocaleString() : "—"}</td>
                        <td className="px-3 py-2 text-xs text-red-600">{r.error ?? "—"}</td>
                      </tr>
                    ))}
                    {data.runs.length === 0 && (
                      <tr>
                        <td className="px-3 py-2 text-slate-600" colSpan={6}>
                          No runs logged yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <InvoiceApprovalPanel invoices={data.invoices} />
          </>
        )}
      </div>
    </main>
  );
}
