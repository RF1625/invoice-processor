import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireFirmId } from "@/lib/tenant";

type RunRecord = {
  id: string;
  status: string;
  fileName: string | null;
  vendor?: { name: string | null } | null;
  vendorNo?: string | null;
  navVendorNo?: string | null;
  createdAt: Date;
  error?: string | null;
};

const mapRun = (r: RunRecord) => ({
  id: r.id,
  status: r.status,
  fileName: r.fileName,
  vendorName: r.vendor?.name ?? null,
  navVendorNo: r.vendorNo ?? r.navVendorNo ?? null,
  createdAt: r.createdAt,
  error: r.error ?? null,
});

export async function GET() {
  try {
    const firmId = await requireFirmId();
    const primary = (prisma as unknown as { run?: unknown }).run;
    const legacy = (prisma as unknown as { invoiceRun?: unknown }).invoiceRun;
    let runs: RunRecord[] = [];

    try {
      if (primary && typeof (primary as { findMany: unknown }).findMany === "function") {
        runs = await (primary as { findMany: (args: unknown) => Promise<RunRecord[]> }).findMany({
          where: { firmId },
          include: { vendor: true },
          orderBy: { createdAt: "desc" },
          take: 10,
        });
      } else {
        throw new Prisma.PrismaClientKnownRequestError("Missing run delegate", {
          clientVersion: "local",
          code: "P2021",
        });
      }
    } catch (err) {
      const isMissingTable =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2021";

      if (isMissingTable && legacy && typeof (legacy as { findMany: unknown }).findMany === "function") {
        runs = await (legacy as { findMany: (args: unknown) => Promise<RunRecord[]> }).findMany({
          include: { vendor: true },
          orderBy: { createdAt: "desc" },
          take: 10,
        });
      } else {
        throw err;
      }
    }

    return NextResponse.json(
      {
        runs: runs.map(mapRun),
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("Failed to fetch invoice runs", err);
    return NextResponse.json({ error: "Failed to fetch invoice runs" }, { status: 500 });
  }
}
