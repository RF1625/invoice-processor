import Link from "next/link";
import { Prisma } from "@/lib/generated/prisma/client";
import { VendorManager, RuleManager, GlAccountManager, DimensionManager, InvoiceApprovalPanel } from "./forms";
import { prisma } from "@/lib/prisma";
import { requireFirmId } from "@/lib/tenant";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DatabasePage() {
  const data = await (async () => {
    try {
      const firmId = await requireFirmId();
      const invoices = await fetchInvoicesWithApprovals(firmId);
      return await Promise.all([
        prisma.vendor.findMany({ where: { firmId }, orderBy: { vendorNo: "asc" } }),
        prisma.glAccount.findMany({ where: { firmId }, orderBy: { no: "asc" } }),
        prisma.dimension.findMany({ where: { firmId }, orderBy: [{ code: "asc" }, { valueCode: "asc" }] }),
        prisma.vendorRule.findMany({
          where: { firmId },
          include: { vendor: true },
          orderBy: { priority: "asc" },
        }),
        prisma.run.findMany({
          where: { firmId },
          include: { vendor: true },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
        invoices,
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
              <p className="text-xs uppercase tracking-wide text-slate-500">Master data (Supabase/Postgres)</p>
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
              Unable to connect to the Postgres instance. Check that <code>DATABASE_URL</code> points to your Supabase
              or Postgres server (for Supabase use the psql connection string with <code>sslmode=require</code>) and
              that SSL/firewall rules allow this machine to connect.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const [vendors, glAccounts, dimensions, rules, runs, invoices] = data;

  const vendorInputs = vendors.map((v) => ({
    id: v.id,
    vendorNo: v.vendorNo,
    name: v.name,
    gstNumber: v.gstNumber,
    defaultCurrency: v.defaultCurrency,
    defaultDimensions: v.defaultDimensions as Record<string, string> | null,
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
    dimensionOverrides: r.dimensionOverrides as Record<string, string> | null,
    active: r.active,
    comment: r.comment,
    vendorName: r.vendor?.name ?? null,
  }));

  const invoiceInputs = invoices.map((inv) => ({
    id: inv.id,
    invoiceNo: inv.invoiceNo,
    vendorName: inv.vendor?.name ?? null,
    status: inv.status,
    currencyCode: inv.currencyCode,
    totalAmount: Number(inv.totalAmount ?? 0),
    approvals: inv.approvals.map((a) => ({
      id: a.id,
      status: a.status,
      comment: a.comment,
      actedAt: a.actedAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
    })),
  }));

  return (
    <main className="min-h-screen bg-slate-50 p-8 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Master data (Supabase/Postgres)</p>
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

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">G/L Accounts</h2>
            <span className="text-xs text-slate-600">{glAccounts.length} entries</span>
          </div>
          <GlAccountManager glAccounts={glAccountInputs} />
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Dimensions</h2>
            <span className="text-xs text-slate-600">{dimensions.length} values</span>
          </div>
          <DimensionManager dimensions={dimensionInputs} />
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

        <InvoiceApprovalPanel invoices={invoiceInputs} />
      </div>
    </main>
  );
}

async function fetchInvoicesWithApprovals(firmId: string) {
  try {
    return await prisma.invoice.findMany({
      where: { firmId },
      include: { vendor: true, approvals: { orderBy: { createdAt: "desc" } } },
      orderBy: { createdAt: "desc" },
      take: 15,
    });
  } catch (err) {
    const isMissingColumn =
      err instanceof Prisma.PrismaClientKnownRequestError && (err.code === "P2022" || err.code === "P2021");
    if (!isMissingColumn) {
      throw err;
    }

    console.warn("Invoice fetch failed due to missing columns, falling back to raw queries", err);

    const firmUuid = Prisma.sql`${firmId}::uuid`;
    const invoices = await prisma.$queryRaw<
      Array<{
        id: string;
        invoice_no: string | null;
        vendor_id: string | null;
        status: string;
        currency_code: string | null;
        total_amount: Prisma.Decimal | number | null;
        created_at: Date;
        vendor_name: string | null;
      }>
    >(Prisma.sql`
      SELECT i.id,
             i.invoice_no,
             i.vendor_id,
             i.status,
             i.currency_code,
             i.total_amount,
             i.created_at,
             v.name AS vendor_name
      FROM invoices i
      LEFT JOIN vendors v ON v.id = i.vendor_id
      WHERE i.firm_id = ${firmUuid}
      ORDER BY i.created_at DESC
      LIMIT 15
    `);

    const invoiceIds = invoices.map((i) => i.id);
    let approvals: Array<{
      id: string;
      invoice_id: string;
      status: string;
      comment: string | null;
      acted_at: Date | null;
      created_at: Date;
    }> = [];

    if (invoiceIds.length > 0) {
      try {
        const invoiceIdArray = Prisma.sql`ARRAY[${Prisma.join(invoiceIds)}]::uuid[]`;
        approvals = await prisma.$queryRaw<
          Array<{
            id: string;
            invoice_id: string;
            status: string;
            comment: string | null;
            acted_at: Date | null;
            created_at: Date;
          }>
        >(Prisma.sql`
          SELECT id, invoice_id, status, comment, acted_at, created_at
          FROM invoice_approvals
          WHERE firm_id = ${firmUuid} AND invoice_id = ANY (${invoiceIdArray})
          ORDER BY created_at DESC
        `);
      } catch (approvalErr) {
        console.warn("Invoice approval fallback failed", approvalErr);
      }
    }

    const grouped = approvals.reduce<Record<string, typeof approvals>>((acc, approval) => {
      if (!acc[approval.invoice_id]) acc[approval.invoice_id] = [];
      acc[approval.invoice_id]?.push(approval);
      return acc;
    }, {});

    return invoices.map((inv) => ({
      id: inv.id,
      invoiceNo: inv.invoice_no,
      vendor: inv.vendor_name ? { name: inv.vendor_name } : null,
      status: inv.status,
      currencyCode: inv.currency_code,
      totalAmount: inv.total_amount ?? 0,
      createdAt: inv.created_at,
      approvals:
        grouped[inv.id]?.map((a) => ({
          id: a.id,
          status: a.status,
          comment: a.comment,
          actedAt: a.acted_at,
          createdAt: a.created_at,
        })) ?? [],
    }));
  }
}
