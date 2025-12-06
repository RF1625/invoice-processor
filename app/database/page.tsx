import Link from "next/link";
import { VendorManager, RuleManager } from "./forms";
import { prisma } from "@/lib/prisma";

export default async function DatabasePage() {
  const data = await (async () => {
    try {
      return await Promise.all([
        prisma.vendor.findMany({ orderBy: { vendorNo: "asc" } }),
        prisma.glAccount.findMany({ orderBy: { no: "asc" } }),
        prisma.dimension.findMany({ orderBy: [{ code: "asc" }, { valueCode: "asc" }] }),
        prisma.vendorRule.findMany({ include: { vendor: true }, orderBy: { priority: "asc" } }),
        prisma.run.findMany({ include: { vendor: true }, orderBy: { createdAt: "desc" }, take: 10 }),
      ]);
    } catch (err) {
      console.error("Database fetch failed", err);
      return null;
    }
  })();

  if (!data) {
    return (
      <main className="min-h-screen bg-slate-50 p-8 text-slate-900">
        <div className="mx-auto max-w-3xl space-y-4">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">NAV master data</p>
              <h1 className="text-2xl font-semibold">Vendors, G/L accounts & rules</h1>
            </div>
            <Link
              href="/"
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Back to app
            </Link>
          </header>
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <div className="font-semibold">Database unavailable</div>
            <p className="mt-1">
              Unable to connect to the Postgres instance. Check that <code>DATABASE_URL</code> points to your running
              server (e.g. <code>rfleck-invoice-pg-flex.postgres.database.azure.com:5432</code>) and that SSL/firewall
              rules allow this machine to connect.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const [vendors, glAccounts, dimensions, rules, runs] = data;

  const vendorInputs = vendors.map((v) => ({
    id: v.id,
    vendorNo: v.vendorNo,
    name: v.name,
    gstNumber: v.gstNumber,
    defaultCurrency: v.defaultCurrency,
    defaultDimensions: v.defaultDimensions as Record<string, string> | null,
    active: v.active,
  }));

  const glAccountInputs = glAccounts.map((g) => ({ id: g.id, no: g.no, name: g.name }));

  const ruleInputs = rules.map((r) => ({
    id: r.id,
    vendorId: r.vendorId,
    priority: r.priority,
    matchType: r.matchType,
    matchValue: r.matchValue,
    glAccountNo: r.glAccountNo,
    dimensionOverrides: r.dimensionOverrides as Record<string, string> | null,
    active: r.active,
    comment: r.comment,
    vendorName: r.vendor?.name ?? null,
  }));

  return (
    <main className="min-h-screen bg-slate-50 p-8 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">NAV master data</p>
            <h1 className="text-2xl font-semibold">Vendors, G/L accounts & rules</h1>
          </div>
          <Link
            href="/"
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Back to app
          </Link>
        </header>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Vendors</h2>
            <span className="text-xs text-slate-600">{vendors.length} total</span>
          </div>
          <VendorManager vendors={vendorInputs} />
        </section>

        <section className="rounded-xl bg-white p-4 shadow ring-1 ring-slate-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">G/L Accounts</h2>
            <span className="text-xs text-slate-600">{glAccounts.length} entries</span>
          </div>
          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left">No</th>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {glAccounts.map((g) => (
                  <tr key={g.id}>
                    <td className="px-3 py-2 font-mono text-slate-800">{g.no}</td>
                    <td className="px-3 py-2">{g.name}</td>
                    <td className="px-3 py-2">{g.type ?? "—"}</td>
                  </tr>
                ))}
                {glAccounts.length === 0 && (
                  <tr>
                    <td className="px-3 py-2 text-slate-600" colSpan={3}>
                      No G/L accounts synced yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl bg-white p-4 shadow ring-1 ring-slate-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Dimensions</h2>
            <span className="text-xs text-slate-600">{dimensions.length} values</span>
          </div>
          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left">Code</th>
                  <th className="px-3 py-2 text-left">Value code</th>
                  <th className="px-3 py-2 text-left">Value name</th>
                  <th className="px-3 py-2 text-left">Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dimensions.map((d) => (
                  <tr key={d.id}>
                    <td className="px-3 py-2 font-mono text-slate-800">{d.code}</td>
                    <td className="px-3 py-2 font-mono text-slate-800">{d.valueCode}</td>
                    <td className="px-3 py-2">{d.valueName}</td>
                    <td className="px-3 py-2">{d.active ? "Yes" : "No"}</td>
                  </tr>
                ))}
                {dimensions.length === 0 && (
                  <tr>
                    <td className="px-3 py-2 text-slate-600" colSpan={4}>
                      No dimensions synced yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Vendor rules</h2>
            <span className="text-xs text-slate-600">{rules.length} rules</span>
          </div>
          <RuleManager vendors={vendorInputs} glAccounts={glAccountInputs} rules={ruleInputs} />
        </section>

        <section className="rounded-xl bg-white p-4 shadow ring-1 ring-slate-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent runs</h2>
            <span className="text-xs text-slate-600">Last {runs.length}</span>
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
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2">{r.status}</td>
                    <td className="px-3 py-2">{r.vendor?.name ?? "—"}</td>
                    <td className="px-3 py-2">{r.vendorNo ?? "—"}</td>
                    <td className="px-3 py-2">{r.fileName ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{r.createdAt.toLocaleString()}</td>
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
          </div>
        </section>
      </div>
    </main>
  );
}
