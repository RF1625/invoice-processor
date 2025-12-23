import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFirmId } from "@/lib/tenant";

export async function GET() {
  try {
    const firmId = await requireFirmId();
    const [vendors, glAccounts, dimensions, rules, runsRaw, invoices] = await Promise.all([
      prisma.vendor.findMany({ where: { firmId }, orderBy: { vendorNo: "asc" } }),
      prisma.glAccount.findMany({ where: { firmId }, orderBy: { no: "asc" } }),
      prisma.dimension.findMany({
        where: { firmId },
        orderBy: [{ code: "asc" }, { valueCode: "asc" }],
      }),
      prisma.vendorRule.findMany({
        where: { firmId },
        include: { vendor: true },
        orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      }),
      prisma.run.findMany({
        where: { firmId },
        include: { vendor: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.invoice.findMany({
        where: { firmId },
        include: {
          vendor: true,
          approvals: { orderBy: { createdAt: "desc" } },
          approvalApprover: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    const runs = runsRaw.map((run) => ({
      id: run.id,
      status: run.status,
      vendorName: run.vendor?.name ?? null,
      vendorNo: run.vendorNo ?? null,
      fileName: run.fileName ?? null,
      createdAt: run.createdAt,
      error: run.error ?? null,
    }));

    return NextResponse.json(
      {
        vendors,
        glAccounts,
        dimensions,
        rules,
        runs,
        invoices,
      },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch database snapshot";
    const status = message.includes("Unauthorized") ? 401 : 500;
    console.error("Failed to fetch database snapshot", err);
    return NextResponse.json({ error: message }, { status });
  }
}
