import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type RunRecord = {
  id: string;
  status: string;
  fileName: string | null;
  vendor?: { name: string | null; vendorNo?: string | null } | null;
  vendorNo?: string | null;
  navVendorNo?: string | null;
  createdAt: Date;
  error?: string | null;
  invoicePayload?: unknown;
  navPayload?: unknown;
  ruleApplications?: unknown;
};

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const primary = (prisma as unknown as { run?: unknown }).run;
    const legacy = (prisma as unknown as { invoiceRun?: unknown }).invoiceRun;

    const fetchRun = async (delegate: { findUnique: (args: unknown) => Promise<RunRecord | null> }) =>
      delegate.findUnique({ where: { id: params.id }, include: { vendor: true } });

    let run: RunRecord | null = null;

    try {
      if (primary && typeof (primary as { findUnique: unknown }).findUnique === "function") {
        run = await fetchRun(primary as { findUnique: (args: unknown) => Promise<RunRecord | null> });
      } else {
        throw new Prisma.PrismaClientKnownRequestError("Missing run delegate", {
          clientVersion: "local",
          code: "P2021",
        });
      }
    } catch (err) {
      const isMissingTable =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2021";

      if (isMissingTable && legacy && typeof (legacy as { findUnique: unknown }).findUnique === "function") {
        run = await fetchRun(legacy as { findUnique: (args: unknown) => Promise<RunRecord | null> });
      } else {
        throw err;
      }
    }

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    return NextResponse.json(
      {
        id: run.id,
        status: run.status,
        fileName: run.fileName,
        vendorName: run.vendor?.name ?? null,
        navVendorNo: run.vendorNo ?? run.navVendorNo ?? run.vendor?.vendorNo ?? null,
        createdAt: run.createdAt,
        error: run.error,
        payload: run.invoicePayload ?? (run as { payload?: unknown }).payload,
        navPayload: run.navPayload ?? (run as { navPayload?: unknown }).navPayload,
        ruleApplications: run.ruleApplications,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("Failed to fetch invoice run detail", err);
    return NextResponse.json({ error: "Failed to fetch run detail" }, { status: 500 });
  }
}
