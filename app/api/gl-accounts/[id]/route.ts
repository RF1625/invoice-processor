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
    const existing = await prisma.glAccount.findFirst({ where: { id: params.id, firmId } });
    if (!existing) return NextResponse.json({ error: "G/L account not found" }, { status: 404 });

    const body = await req.json();
    const glAccount = await prisma.glAccount.update({
      where: { id: params.id },
      data: {
        no: body.no,
        name: body.name,
        type: body.type ?? null,
      },
    });
    return NextResponse.json({ glAccount }, { status: 200 });
  } catch (err) {
    console.error("Failed to update G/L account", err);
    return NextResponse.json({ error: "Failed to update G/L account" }, { status: 400 });
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
    const existing = await prisma.glAccount.findFirst({ where: { id: params.id, firmId } });
    if (!existing) return NextResponse.json({ error: "G/L account not found" }, { status: 404 });
    await prisma.glAccount.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("Failed to delete G/L account", err);
    return NextResponse.json({ error: "Failed to delete G/L account" }, { status: 400 });
  }
}
