import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFirmId } from "@/lib/tenant";

const parseJson = (raw: unknown) => {
  if (typeof raw === "string" && raw.trim().length > 0) {
    return JSON.parse(raw);
  }
  if (raw && typeof raw === "object") return raw;
  return {};
};

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const firmId = await requireFirmId();
  const vendor = await prisma.vendor.findFirst({ where: { id: params.id, firmId } });
  if (!vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
  return NextResponse.json({ vendor }, { status: 200 });
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const firmId = await requireFirmId();
    const existing = await prisma.vendor.findFirst({ where: { id: params.id, firmId } });
    if (!existing) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });

    const body = await req.json();
    const vendor = await prisma.vendor.update({
      where: { id: params.id },
      data: {
        vendorNo: body.vendorNo,
        name: body.name,
        gstNumber: body.gstNumber ?? null,
        defaultCurrency: body.defaultCurrency ?? null,
        defaultDimensions: parseJson(body.defaultDimensions),
        active: body.active ?? true,
      },
    });
    return NextResponse.json({ vendor }, { status: 200 });
  } catch (err) {
    console.error("Failed to update vendor", err);
    return NextResponse.json({ error: "Failed to update vendor" }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const firmId = await requireFirmId();
    const existing = await prisma.vendor.findFirst({ where: { id: params.id, firmId } });
    if (!existing) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    await prisma.vendor.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("Failed to delete vendor", err);
    return NextResponse.json({ error: "Failed to delete vendor" }, { status: 400 });
  }
}
