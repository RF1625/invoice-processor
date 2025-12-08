import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
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
    const params = await context.params;
    await prisma.dimension.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("Failed to delete dimension value", err);
    return NextResponse.json({ error: "Failed to delete dimension value" }, { status: 400 });
  }
}
