import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const dimensions = await prisma.dimension.findMany({ orderBy: [{ code: "asc" }, { valueCode: "asc" }] });
  return NextResponse.json({ dimensions }, { status: 200 });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const dimension = await prisma.dimension.create({
      data: {
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
