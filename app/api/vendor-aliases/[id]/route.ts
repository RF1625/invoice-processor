import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFirmId } from "@/lib/tenant";
import { validateRequestOrigin } from "@/lib/auth";
import { Prisma } from "@prisma/client";

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const originCheck = validateRequestOrigin(req);
    if (!originCheck.ok) {
      return NextResponse.json({ error: originCheck.error }, { status: 403 });
    }

    const params = await context.params;
    const firmId = await requireFirmId();
    const existing = await prisma.vendorAlias.findFirst({ where: { id: params.id, firmId } });
    if (!existing) return NextResponse.json({ error: "Alias not found" }, { status: 404 });

    const body = (await req.json()) as { aliasText?: string; confidenceHint?: number };
    const aliasText = body.aliasText != null ? body.aliasText.toString().trim() : existing.aliasText;
    if (!aliasText) return NextResponse.json({ error: "aliasText is required" }, { status: 400 });

    const hint =
      typeof body.confidenceHint === "number" && Number.isFinite(body.confidenceHint)
        ? Math.max(0, Math.min(1, body.confidenceHint))
        : existing.confidenceHint;

    const updated = await prisma.vendorAlias.update({
      where: { id: params.id },
      data: { aliasText, confidenceHint: hint instanceof Prisma.Decimal ? hint : new Prisma.Decimal(hint as any) },
      include: { vendor: true },
    });

    return NextResponse.json({ alias: updated }, { status: 200 });
  } catch (err) {
    console.error("Failed to update vendor alias", err);
    return NextResponse.json({ error: "Failed to update vendor alias" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const originCheck = validateRequestOrigin(req);
    if (!originCheck.ok) {
      return NextResponse.json({ error: originCheck.error }, { status: 403 });
    }

    const params = await context.params;
    const firmId = await requireFirmId();
    const existing = await prisma.vendorAlias.findFirst({ where: { id: params.id, firmId } });
    if (!existing) return NextResponse.json({ error: "Alias not found" }, { status: 404 });

    await prisma.vendorAlias.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("Failed to delete vendor alias", err);
    return NextResponse.json({ error: "Failed to delete vendor alias" }, { status: 400 });
  }
}

