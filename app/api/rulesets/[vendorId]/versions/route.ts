import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { validateRequestOrigin } from "@/lib/auth";
import { parseAndValidateDsl, validateDslReferences } from "@/lib/rulesDsl";

export async function POST(req: NextRequest, context: { params: Promise<{ vendorId: string }> }) {
  try {
    const originCheck = validateRequestOrigin(req);
    if (!originCheck.ok) {
      return NextResponse.json({ error: originCheck.error }, { status: 403 });
    }

    const params = await context.params;
    const session = await requireSession();
    const firmId = session.firmId;
    const userId = session.userId;
    const vendorId = params.vendorId;

    const body = (await req.json()) as {
      dsl?: unknown;
      notes?: string | null;
      llmTraceId?: string | null;
      activate?: boolean;
    };

    const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, firmId }, select: { id: true } });
    if (!vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });

    const { dsl, errors } = parseAndValidateDsl(body.dsl);
    if (dsl.vendor_id !== vendorId) {
      errors.push({ path: "$.vendor_id", message: "vendor_id must match vendorId" });
    }
    if (errors.length) {
      return NextResponse.json({ error: "Invalid DSL", details: errors }, { status: 400 });
    }

    const [glAccounts, dimensions] = await Promise.all([
      prisma.glAccount.findMany({ where: { firmId }, select: { no: true } }),
      prisma.dimension.findMany({ where: { firmId, active: true }, select: { code: true, valueCode: true } }),
    ]);

    const { errors: refErrors, requiredMappings } = validateDslReferences({
      dsl,
      validGlCodes: new Set(glAccounts.map((g) => g.no)),
      validDimensionValues: new Set(dimensions.map((d) => `${d.code}:${d.valueCode}`)),
    });
    if (refErrors.length) {
      return NextResponse.json({ error: "Invalid DSL references", details: refErrors, requiredMappings }, { status: 400 });
    }

    const activate = body.activate === true;
    const notes = typeof body.notes === "string" ? body.notes : null;
    const llmTraceId = typeof body.llmTraceId === "string" ? body.llmTraceId : null;

    const result = await prisma.$transaction(async (tx) => {
      const ruleset =
        (await tx.ruleset.findFirst({ where: { firmId, vendorId } })) ??
        (await tx.ruleset.create({
          data: { firmId, vendorId, createdBy: userId, updatedBy: userId },
        }));

      const latest = await tx.ruleVersion.findFirst({
        where: { rulesetId: ruleset.id },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const nextVersion = (latest?.version ?? 0) + 1;

      const created = await tx.ruleVersion.create({
        data: {
          rulesetId: ruleset.id,
          version: nextVersion,
          dslJson: dsl as any,
          llmTraceId,
          notes,
          createdBy: userId,
        },
      });

      const updatedRuleset = activate
        ? await tx.ruleset.update({
            where: { id: ruleset.id },
            data: { activeVersionId: created.id, updatedBy: userId },
          })
        : ruleset;

      return { ruleset: updatedRuleset, version: created };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error("Failed to save rule version", err);
    const message = err instanceof Error ? err.message : "Failed to save rule version";
    const status = message.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

