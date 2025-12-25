"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { VendorManager, RuleManager, GlAccountManager, DimensionManager } from "./forms";
import { InvoiceApprovalsLoader } from "./invoice-approvals-loader";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { emptyDatabaseSnapshot, type DatabaseSnapshot } from "@/lib/database-cache";
import { fetchAndCache, readCache } from "@/lib/client-cache";
import { fetchDatabaseSnapshot } from "@/lib/nav-prefetch";

const CACHE_KEY = "db-cache-v1";
const CACHE_TTL_MS = 120_000;

export default function DatabasePage() {
  const router = useRouter();
  const [data, setData] = useState<DatabaseSnapshot>(emptyDatabaseSnapshot);
  const [isReady, setIsReady] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const shouldRefresh = useMemo(
    () => lastUpdated == null || Date.now() - lastUpdated > CACHE_TTL_MS,
    [lastUpdated],
  );

  const refreshData = useCallback(() => {
    startTransition(async () => {
      try {
        setError(null);
        const entry = await fetchAndCache(CACHE_KEY, fetchDatabaseSnapshot);
        setData(entry.data);
        setIsReady(true);
        setLastUpdated(entry.updatedAt);
      } catch (err) {
        if (err instanceof Error && err.message.includes("Unauthorized")) {
          router.push("/login?redirect=/database");
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load data");
        setIsReady(true);
      }
    });
  }, [router, startTransition]);

  useEffect(() => {
    const cachedEntry = readCache<DatabaseSnapshot>(CACHE_KEY);
    if (cachedEntry) {
      setData(cachedEntry.data);
      setLastUpdated(cachedEntry.updatedAt);
    }
    setIsReady(true);
  }, []);

  // Initial fetch if no cache yet or data is stale.
  useEffect(() => {
    if (!isReady) return;
    if (!shouldRefresh) return;
    void refreshData();
  }, [isReady, shouldRefresh, refreshData]);

  const contentReady = useMemo(() => isReady || data !== emptyDatabaseSnapshot, [isReady, data]);

  return (
    <main className="min-h-screen bg-white p-8 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex items-center">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Master data (Supabase/Postgres)</p>
            <h1 className="text-2xl font-semibold">Vendors, G/L accounts & rules</h1>
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
            <Accordion
              type="multiple"
              defaultValue={["vendors", "gl-accounts", "dimensions", "vendor-rules"]}
              className="space-y-4"
            >
              <AccordionItem value="vendors" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <AccordionTrigger className="px-4 py-3 text-slate-900 hover:no-underline">
                  <div className="flex w-full items-center justify-between gap-3">
                    <span className="text-lg font-semibold">Vendors</span>
                    <span className="text-xs text-slate-600">{data.vendors.length} total</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <VendorManager vendors={data.vendors} />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="gl-accounts" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <AccordionTrigger className="px-4 py-3 text-slate-900 hover:no-underline">
                  <div className="flex w-full items-center justify-between gap-3">
                    <span className="text-lg font-semibold">G/L Accounts</span>
                    <span className="text-xs text-slate-600">{data.glAccounts.length} entries</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <GlAccountManager glAccounts={data.glAccounts} />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="dimensions" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <AccordionTrigger className="px-4 py-3 text-slate-900 hover:no-underline">
                  <div className="flex w-full items-center justify-between gap-3">
                    <span className="text-lg font-semibold">Dimensions</span>
                    <span className="text-xs text-slate-600">{data.dimensions.length} values</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <DimensionManager dimensions={data.dimensions} />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="vendor-rules" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <AccordionTrigger className="px-4 py-3 text-slate-900 hover:no-underline">
                  <div className="flex w-full items-center justify-between gap-3">
                    <span className="text-lg font-semibold">Vendor rules</span>
                    <span className="text-xs text-slate-600">{data.rules.length} rules</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <RuleManager vendors={data.vendors} glAccounts={data.glAccounts} rules={data.rules} />
                </AccordionContent>
              </AccordionItem>
            </Accordion>

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

            <InvoiceApprovalsLoader />

          </>
        )}
      </div>
    </main>
  );
}
