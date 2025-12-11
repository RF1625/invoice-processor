"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { VendorManager, RuleManager, GlAccountManager, DimensionManager } from "./forms";
import type { MatchType } from "@/lib/generated/prisma/client";
import { InvoiceApprovalsLoader } from "./invoice-approvals-loader";

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
  createdAt?: string | Date | null;
  error?: string | null;
};

export default function DatabasePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vendors, setVendors] = useState<VendorInput[]>([]);
  const [glAccounts, setGlAccounts] = useState<GlAccountInput[]>([]);
  const [dimensions, setDimensions] = useState<DimensionInput[]>([]);
  const [rules, setRules] = useState<RuleInput[]>([]);
  const [runs, setRuns] = useState<RunInput[]>([]);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [vendorsRes, glRes, dimRes, ruleRes, runRes] = await Promise.all([
        fetch("/api/vendors", { cache: "no-store" }),
        fetch("/api/gl-accounts", { cache: "no-store" }),
        fetch("/api/dimensions", { cache: "no-store" }),
        fetch("/api/vendor-rules", { cache: "no-store" }),
        fetch("/api/invoice-runs", { cache: "no-store" }),
      ]);

      if (vendorsRes.status === 401 || glRes.status === 401) {
        router.push("/login?redirect=/database");
        return;
      }

      const [vendorsJson, glJson, dimJson, ruleJson, runJson] = await Promise.all([
        vendorsRes.json(),
        glRes.json(),
        dimRes.json(),
        ruleRes.json(),
        runRes.json(),
      ]);

      if (!vendorsRes.ok) throw new Error(vendorsJson.error ?? "Failed to load vendors");
      if (!glRes.ok) throw new Error(glJson.error ?? "Failed to load GL accounts");
      if (!dimRes.ok) throw new Error(dimJson.error ?? "Failed to load dimensions");
      if (!ruleRes.ok) throw new Error(ruleJson.error ?? "Failed to load rules");
      if (!runRes.ok) throw new Error(runJson.error ?? "Failed to load runs");

      setVendors(vendorsJson.vendors ?? []);
      setGlAccounts(glJson.glAccounts ?? []);
      setDimensions(dimJson.dimensions ?? []);
      setRules(
        (ruleJson.rules ?? []).map((r: any) => ({
          id: r.id,
          vendorId: r.vendorId,
          priority: r.priority,
          matchType: r.matchType as MatchType,
          matchValue: r.matchValue ?? null,
          glAccountNo: r.glAccountNo ?? null,
          dimensionOverrides: r.dimensionOverrides ?? null,
          active: r.active,
          comment: r.comment ?? null,
          vendorName: r.vendor?.name ?? null,
        })),
      );
      setRuns(runJson.runs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load database data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const vendorInputs = vendors.map((v) => ({
    id: v.id,
    vendorNo: v.vendorNo,
    name: v.name,
    gstNumber: v.gstNumber,
    defaultCurrency: v.defaultCurrency,
    defaultDimensions: v.defaultDimensions,
    active: v.active,
  }));

  const glAccountInputs = glAccounts.map((g) => ({ id: g.id, no: g.no, name: g.name, type: g.type }));

  const dimensionInputs = dimensions.map((d) => ({
    id: d.id,
    code: d.code,
    valueCode: d.valueCode,
    valueName: d.valueName,
    active: d.active,
  }));

  const ruleInputs = rules.map((r) => ({
    id: r.id,
    vendorId: r.vendorId,
    priority: r.priority,
    matchType: r.matchType,
    matchValue: r.matchValue,
    glAccountNo: r.glAccountNo,
    dimensionOverrides: r.dimensionOverrides,
    active: r.active,
    comment: r.comment,
    vendorName: r.vendorName ?? null,
  }));

  return (
    <main className="min-h-screen bg-slate-50 p-8 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Master data (Supabase/Postgres)</p>
            <h1 className="text-2xl font-semibold">Vendors, G/L accounts & rules</h1>
          </div>
          <div className="flex items-center gap-3">
            {loading && <span className="text-xs text-slate-500">Refreshing…</span>}
            <button
              type="button"
              onClick={() => loadAll()}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Refresh
            </button>
            <Link
              href="/"
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
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

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Vendors</h2>
            <span className="text-xs text-slate-600">{vendors.length} total</span>
          </div>
          {loading && vendors.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Loading vendors…</div>
          ) : (
            <VendorManager vendors={vendorInputs} />
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">G/L Accounts</h2>
            <span className="text-xs text-slate-600">{glAccounts.length} entries</span>
          </div>
          {loading && glAccounts.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Loading G/L accounts…</div>
          ) : (
            <GlAccountManager glAccounts={glAccountInputs} />
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Dimensions</h2>
            <span className="text-xs text-slate-600">{dimensions.length} values</span>
          </div>
          {loading && dimensions.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Loading dimensions…</div>
          ) : (
            <DimensionManager dimensions={dimensionInputs} />
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Vendor rules</h2>
            <span className="text-xs text-slate-600">{rules.length} rules</span>
          </div>
          {loading && rules.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Loading rules…</div>
          ) : (
            <RuleManager vendors={vendorInputs} glAccounts={glAccountInputs} rules={ruleInputs} />
          )}
        </section>

        <section className="rounded-xl bg-white p-4 shadow ring-1 ring-slate-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent runs</h2>
            <span className="text-xs text-slate-600">Last {runs.length}</span>
          </div>
          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
            {loading && runs.length === 0 ? (
              <div className="px-3 py-3 text-sm text-slate-600">Loading runs…</div>
            ) : (
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
                  {runs.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2">{r.status}</td>
                      <td className="px-3 py-2">{r.vendorName ?? "—"}</td>
                      <td className="px-3 py-2">{r.vendorNo ?? "—"}</td>
                      <td className="px-3 py-2">{r.fileName ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-slate-600">
                        {r.createdAt ? new Date(r.createdAt).toLocaleString() : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-red-600">{r.error ?? "—"}</td>
                    </tr>
                  ))}
                  {runs.length === 0 && (
                    <tr>
                      <td className="px-3 py-2 text-slate-600" colSpan={6}>
                        No runs logged yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <InvoiceApprovalsLoader />
      </div>
    </main>
  );
}
