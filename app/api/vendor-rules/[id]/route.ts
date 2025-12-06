import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const parseJson = (raw: unknown) => {
  if (typeof raw === "string" && raw.trim().length > 0) {
    return JSON.parse(raw);
  }
  if (raw && typeof raw === "object") return raw;
  return {};
};

export async function PUT(req: NextRequest, context: { params: { id: string } }) {
  try {
    const params = await context.params;
    const body = await req.json();
    const rule = await prisma.vendorRule.update({
      where: { id: params.id },
      data: {
        vendorId: body.vendorId,
        priority: body.priority != null ? Number(body.priority) : 100,
        matchType: body.matchType,
        matchValue: body.matchValue ?? null,
        glAccountNo: body.glAccountNo ?? null,
        dimensionOverrides: parseJson(body.dimensionOverrides),
        active: body.active ?? true,
        comment: body.comment ?? null,
      },
      include: { vendor: true },
    });
    return NextResponse.json({ rule }, { status: 200 });
  } catch (err) {
    console.error("Failed to update rule", err);
    return NextResponse.json({ error: "Failed to update rule" }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, context: { params: { id: string } }) {
  try {
    const params = await context.params;
    await prisma.vendorRule.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("Failed to delete rule", err);
    return NextResponse.json({ error: "Failed to delete rule" }, { status: 400 });
  }
}
