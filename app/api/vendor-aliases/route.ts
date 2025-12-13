import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFirmId } from "@/lib/tenant";
import { validateRequestOrigin } from "@/lib/auth";
import { Prisma } from "@prisma/client";

export async function GET() {
  const firmId = await requireFirmId();
  const aliases = await prisma.vendorAlias.findMany({
    where: { firmId },
    include: { vendor: true },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ aliases }, { status: 200 });
}

export async function POST(req: NextRequest) {
  try {
    const originCheck = validateRequestOrigin(req);
    if (!originCheck.ok) {
      return NextResponse.json({ error: originCheck.error }, { status: 403 });
    }

    const firmId = await requireFirmId();
    const body = (await req.json()) as { vendorId?: string; aliasText?: string; confidenceHint?: number };
    if (!body.vendorId || typeof body.vendorId !== "string") {
      return NextResponse.json({ error: "vendorId is required" }, { status: 400 });
    }
    const aliasText = (body.aliasText ?? "").toString().trim();
    if (!aliasText) return NextResponse.json({ error: "aliasText is required" }, { status: 400 });

    const vendor = await prisma.vendor.findFirst({ where: { id: body.vendorId, firmId }, select: { id: true } });
    if (!vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });

    const hint =
      typeof body.confidenceHint === "number" && Number.isFinite(body.confidenceHint)
        ? Math.max(0, Math.min(1, body.confidenceHint))
        : 1;

    const created = await prisma.vendorAlias.create({
      data: {
        firmId,
        vendorId: body.vendorId,
        aliasText,
        confidenceHint: new Prisma.Decimal(hint),
      },
      include: { vendor: true },
    });

    return NextResponse.json({ alias: created }, { status: 201 });
  } catch (err) {
    console.error("Failed to create vendor alias", err);
    return NextResponse.json({ error: "Failed to create vendor alias" }, { status: 400 });
  }
}

