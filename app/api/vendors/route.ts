import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const vendors = await prisma.vendor.findMany({ orderBy: { vendorNo: "asc" } });
  return NextResponse.json({ vendors }, { status: 200 });
}

const parseJson = (raw: unknown) => {
  if (typeof raw === "string" && raw.trim().length > 0) {
    return JSON.parse(raw);
  }
  if (raw && typeof raw === "object") return raw;
  return {};
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const vendor = await prisma.vendor.create({
      data: {
        vendorNo: body.vendorNo,
        name: body.name,
        gstNumber: body.gstNumber ?? null,
        defaultCurrency: body.defaultCurrency ?? null,
        defaultDimensions: parseJson(body.defaultDimensions),
        active: body.active ?? true,
      },
    });
    return NextResponse.json({ vendor }, { status: 201 });
  } catch (err) {
    console.error("Failed to create vendor", err);
    return NextResponse.json({ error: "Failed to create vendor" }, { status: 400 });
  }
}
