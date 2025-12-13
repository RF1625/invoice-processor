import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFirmId } from "@/lib/tenant";
import { validateRequestOrigin } from "@/lib/auth";
import {
  normalizeAndValidateVendorRuleDrafts,
  suggestVendorRulesFromInstruction,
  type VendorRuleDraft,
} from "@/lib/openaiVendorRules";

export async function POST(req: NextRequest) {
  try {
    const originCheck = validateRequestOrigin(req);
    if (!originCheck.ok) {
      return NextResponse.json({ error: originCheck.error }, { status: 403 });
    }

    const firmId = await requireFirmId();
    const body = (await req.json()) as {
      vendorId?: string;
      instruction?: string;
      draftRules?: unknown;
      create?: boolean;
    };

    const vendorId = body.vendorId;
    if (!vendorId || typeof vendorId !== "string") {
      return NextResponse.json({ error: "vendorId is required" }, { status: 400 });
    }

    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, firmId },
      select: { id: true, vendorNo: true, name: true },
    });
    if (!vendor) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }

    const [glAccounts, dimensions] = await Promise.all([
      prisma.glAccount.findMany({
        where: { firmId },
        select: { no: true, name: true, type: true },
        orderBy: { no: "asc" },
      }),
      prisma.dimension.findMany({
        where: { firmId },
        select: { code: true, valueCode: true, valueName: true, active: true },
        orderBy: [{ code: "asc" }, { valueCode: "asc" }],
      }),
    ]);

    const validGlAccountNos = new Set(glAccounts.map((g) => g.no));
    const validDimensionValues = new Set(dimensions.filter((d) => d.active).map((d) => `${d.code}:${d.valueCode}`));

    // If draftRules are provided, validate and optionally persist without calling OpenAI again.
    if (body.draftRules != null) {
      const { drafts, warnings } = normalizeAndValidateVendorRuleDrafts({
        drafts: body.draftRules,
        validGlAccountNos,
        validDimensionValues,
        instructionForComment: null,
      });

      if (body.create) {
        const created = await prisma.$transaction(
          drafts.map((draft) =>
            prisma.vendorRule.create({
              data: {
                firmId,
                vendorId: vendor.id,
                priority: draft.priority != null ? Number(draft.priority) : 100,
                matchType: draft.matchType,
                matchValue: draft.matchValue ?? null,
                glAccountNo: draft.glAccountNo ?? null,
                dimensionOverrides: (draft.dimensionOverrides ?? {}) as any,
                active: draft.active ?? true,
                comment: draft.comment ?? null,
              },
              include: { vendor: true },
            }),
          ),
        );
        return NextResponse.json({ rules: created, warnings }, { status: 201 });
      }

      return NextResponse.json({ rules: drafts, warnings }, { status: 200 });
    }

    const instruction = body.instruction;
    if (!instruction || typeof instruction !== "string" || instruction.trim().length < 5) {
      return NextResponse.json({ error: "instruction is required" }, { status: 400 });
    }

    const suggestion = await suggestVendorRulesFromInstruction({
      instruction,
      vendor: { vendorNo: vendor.vendorNo, name: vendor.name },
      glAccounts,
      dimensions,
    });

    const { drafts, warnings } = normalizeAndValidateVendorRuleDrafts({
      drafts: suggestion.rules,
      validGlAccountNos,
      validDimensionValues,
      instructionForComment: instruction,
    });

    // If requested, persist immediately (single call UX).
    if (body.create) {
      const created = await prisma.$transaction(
        drafts.map((draft) =>
          prisma.vendorRule.create({
            data: {
              firmId,
              vendorId: vendor.id,
              priority: draft.priority != null ? Number(draft.priority) : 100,
              matchType: draft.matchType,
              matchValue: draft.matchValue ?? null,
              glAccountNo: draft.glAccountNo ?? null,
              dimensionOverrides: (draft.dimensionOverrides ?? {}) as any,
              active: draft.active ?? true,
              comment: draft.comment ?? null,
            },
            include: { vendor: true },
          }),
        ),
      );
      return NextResponse.json(
        {
          rules: created,
          notes: suggestion.notes ?? [],
          warnings: [...(suggestion.warnings ?? []), ...warnings],
          confidence: suggestion.confidence ?? null,
        },
        { status: 201 },
      );
    }

    const draftsForClient: VendorRuleDraft[] = drafts;
    return NextResponse.json(
      {
        rules: draftsForClient,
        notes: suggestion.notes ?? [],
        warnings: [...(suggestion.warnings ?? []), ...warnings],
        confidence: suggestion.confidence ?? null,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("Failed to generate vendor rules", err);
    const message = err instanceof Error ? err.message : "Failed to generate vendor rules";
    return NextResponse.json({ error: "Failed to generate vendor rules", details: message }, { status: 400 });
  }
}

