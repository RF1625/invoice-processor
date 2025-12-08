import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
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
    const params = await context.params;
    await prisma.glAccount.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("Failed to delete G/L account", err);
    return NextResponse.json({ error: "Failed to delete G/L account" }, { status: 400 });
  }
}
