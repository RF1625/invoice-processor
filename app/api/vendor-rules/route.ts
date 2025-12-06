import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const parseJson = (raw: unknown) => {
  if (typeof raw === "string" && raw.trim().length > 0) {
    return JSON.parse(raw);
  }
  if (raw && typeof raw === "object") return raw;
  return {};
};

export async function GET() {
  const rules = await prisma.vendorRule.findMany({
    include: { vendor: true },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ rules }, { status: 200 });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rule = await prisma.vendorRule.create({
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
    return NextResponse.json({ rule }, { status: 201 });
  } catch (err) {
    console.error("Failed to create rule", err);
    return NextResponse.json({ error: "Failed to create rule" }, { status: 400 });
  }
}
