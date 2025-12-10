import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFirmId } from "@/lib/tenant";
import { validateRequestOrigin } from "@/lib/auth";

export async function GET() {
  const firmId = await requireFirmId();
  const dimensions = await prisma.dimension.findMany({
    where: { firmId },
    orderBy: [{ code: "asc" }, { valueCode: "asc" }],
  });
  return NextResponse.json({ dimensions }, { status: 200 });
}

export async function POST(req: NextRequest) {
  try {
    const originCheck = validateRequestOrigin(req);
    if (!originCheck.ok) {
      return NextResponse.json({ error: originCheck.error }, { status: 403 });
    }

    const firmId = await requireFirmId();
    const body = await req.json();
    const dimension = await prisma.dimension.create({
      data: {
        firmId,
        code: body.code,
        valueCode: body.valueCode,
        valueName: body.valueName,
        active: body.active ?? true,
      },
    });
    return NextResponse.json({ dimension }, { status: 201 });
  } catch (err) {
    console.error("Failed to create dimension value", err);
    return NextResponse.json({ error: "Failed to create dimension value" }, { status: 400 });
  }
}
