import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFirmId } from "@/lib/tenant";
import { validateRequestOrigin } from "@/lib/auth";

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const originCheck = validateRequestOrigin(req);
    if (!originCheck.ok) {
      return NextResponse.json({ error: originCheck.error }, { status: 403 });
    }

    const params = await context.params;
    const firmId = await requireFirmId();
    const existing = await prisma.dimension.findFirst({ where: { id: params.id, firmId } });
    if (!existing) return NextResponse.json({ error: "Dimension value not found" }, { status: 404 });

    const body = await req.json();
    const dimension = await prisma.dimension.update({
      where: { id: params.id },
      data: {
        code: body.code,
        valueCode: body.valueCode,
        valueName: body.valueName,
        active: body.active ?? true,
      },
    });
    return NextResponse.json({ dimension }, { status: 200 });
  } catch (err) {
    console.error("Failed to update dimension value", err);
    return NextResponse.json({ error: "Failed to update dimension value" }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const req = _req;
    const originCheck = validateRequestOrigin(req);
    if (!originCheck.ok) {
      return NextResponse.json({ error: originCheck.error }, { status: 403 });
    }

    const params = await context.params;
    const firmId = await requireFirmId();
    const existing = await prisma.dimension.findFirst({ where: { id: params.id, firmId } });
    if (!existing) return NextResponse.json({ error: "Dimension value not found" }, { status: 404 });
    await prisma.dimension.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("Failed to delete dimension value", err);
    return NextResponse.json({ error: "Failed to delete dimension value" }, { status: 400 });
  }
}
