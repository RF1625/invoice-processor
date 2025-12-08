import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFirmId } from "@/lib/tenant";

export async function GET() {
  const firmId = await requireFirmId();
  const glAccounts = await prisma.glAccount.findMany({ where: { firmId }, orderBy: { no: "asc" } });
  return NextResponse.json({ glAccounts }, { status: 200 });
}

export async function POST(req: NextRequest) {
  try {
    const firmId = await requireFirmId();
    const body = await req.json();
    const glAccount = await prisma.glAccount.create({
      data: {
        firmId,
        no: body.no,
        name: body.name,
        type: body.type ?? null,
      },
    });
    return NextResponse.json({ glAccount }, { status: 201 });
  } catch (err) {
    console.error("Failed to create G/L account", err);
    return NextResponse.json({ error: "Failed to create G/L account" }, { status: 400 });
  }
}
