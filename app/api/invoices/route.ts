import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFirmId } from "@/lib/tenant";

export async function GET(req: NextRequest) {
  try {
    const firmId = await requireFirmId();
    const takeParam = Number(req.nextUrl.searchParams.get("take") ?? "10");
    const take = Number.isFinite(takeParam) && takeParam > 0 ? Math.min(Math.floor(takeParam), 50) : 10;
    const invoices = await prisma.invoice.findMany({
      where: { firmId },
      include: {
        vendor: true,
        approvals: { orderBy: { createdAt: "desc" } },
        approvalApprover: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take,
    });

    return NextResponse.json({ invoices }, { status: 200 });
  } catch (err) {
    console.error("Failed to fetch invoices", err);
    return NextResponse.json({ error: "Failed to fetch invoices" }, { status: 500 });
  }
}
