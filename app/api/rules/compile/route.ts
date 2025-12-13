import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFirmId } from "@/lib/tenant";
import { validateRequestOrigin } from "@/lib/auth";
import { compileVendorRulesWithLlm } from "@/lib/rulesCompiler";

export async function POST(req: NextRequest) {
  try {
    const originCheck = validateRequestOrigin(req);
    if (!originCheck.ok) {
      return NextResponse.json({ error: originCheck.error }, { status: 403 });
    }

    const firmId = await requireFirmId();
    const body = (await req.json()) as { vendorId?: string; instructionText?: string };
    const vendorId = body.vendorId;
    const instructionText = body.instructionText;

    if (!vendorId || typeof vendorId !== "string") {
      return NextResponse.json({ error: "vendorId is required" }, { status: 400 });
    }
    if (!instructionText || typeof instructionText !== "string" || instructionText.trim().length < 5) {
      return NextResponse.json({ error: "instructionText is required" }, { status: 400 });
    }

    const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, firmId }, select: { id: true } });
    if (!vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });

    const [glAccounts, dimensions] = await Promise.all([
      prisma.glAccount.findMany({ where: { firmId }, select: { no: true, name: true, type: true }, orderBy: { no: "asc" } }),
      prisma.dimension.findMany({
        where: { firmId },
        select: { code: true, valueCode: true, valueName: true, active: true },
        orderBy: [{ code: "asc" }, { valueCode: "asc" }],
      }),
    ]);

    const compiled = await compileVendorRulesWithLlm({
      vendorId,
      instructionText,
      firmContext: { glAccounts, dimensions, approvalPolicies: ["none", "manager"] },
    });

    return NextResponse.json(
      {
        dsl: compiled.dsl,
        warnings: compiled.warnings,
        requiredMappings: compiled.requiredMappings,
        llmTraceId: compiled.llmTraceId,
      },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to compile rules";
    const anyErr = err as any;
    return NextResponse.json(
      {
        error: "Failed to compile rules",
        details: message,
        warnings: anyErr?.warnings ?? [],
        requiredMappings: anyErr?.requiredMappings ?? [],
        llmTraceId: anyErr?.llmTraceId ?? null,
      },
      { status: 400 },
    );
  }
}

