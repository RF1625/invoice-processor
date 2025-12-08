import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFirmId } from "@/lib/tenant";

export async function GET() {
  try {
    const firmId = await requireFirmId();
    const invoices = await prisma.invoice.findMany({
      where: { firmId },
      include: {
        vendor: true,
        approvals: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    });

    return NextResponse.json({ invoices }, { status: 200 });
  } catch (err) {
    console.error("Failed to fetch invoices", err);
    return NextResponse.json({ error: "Failed to fetch invoices" }, { status: 500 });
  }
}
