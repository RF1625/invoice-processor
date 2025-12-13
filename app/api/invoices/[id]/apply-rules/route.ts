import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { validateRequestOrigin } from "@/lib/auth";
import { applyDslDeterministically, type CanonicalInvoice } from "@/lib/rulesDsl";
import { Prisma } from "@prisma/client";

const toNumber = (v: unknown) => {
  if (v instanceof Prisma.Decimal) return v.toNumber();
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
};

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const originCheck = validateRequestOrigin(req);
    if (!originCheck.ok) {
      return NextResponse.json({ error: originCheck.error }, { status: 403 });
    }

    const params = await context.params;
    const session = await requireSession();
    const firmId = session.firmId;
    const userId = session.userId;

    const invoice = await prisma.invoice.findFirst({
      where: { id: params.id, firmId },
      include: { lines: { orderBy: { lineNo: "asc" } }, vendor: true },
    });
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

    if (!invoice.vendorId) {
      await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "needs_review" } });
      return NextResponse.json({ error: "Invoice vendor is not confirmed", status: "needs_review" }, { status: 400 });
    }

    const ruleset = await prisma.ruleset.findFirst({
      where: { firmId, vendorId: invoice.vendorId },
      include: { activeVersion: true },
    });
    const activeVersion = ruleset?.activeVersion ?? null;
    if (!ruleset || !activeVersion) {
      return NextResponse.json({ error: "No active ruleset for vendor" }, { status: 404 });
    }

    const canonical: CanonicalInvoice = {
      invoice_id: invoice.id,
      vendor_id: invoice.vendorId,
      status: invoice.status,
      currency: invoice.currencyCode ?? null,
      invoice_date: invoice.invoiceDate ? invoice.invoiceDate.toISOString().slice(0, 10) : null,
      total: toNumber(invoice.totalAmount),
      lines: invoice.lines.map((l, idx) => ({
        line_index: idx,
        description: l.description ?? null,
        qty: toNumber(l.quantity),
        unit_price: toNumber(l.unitCost),
        amount: toNumber(l.lineAmount),
      })),
    };

    const result = applyDslDeterministically({
      invoice: canonical,
      dsl: activeVersion.dslJson as any,
      ruleVersionId: activeVersion.id,
      vendorMatchStatus: invoice.vendorMatchStatus ?? null,
      vendorMatchConfidence: invoice.vendorMatchConfidence ? toNumber(invoice.vendorMatchConfidence) : null,
    });

    const needsReview =
      !result.eligibility.vendorMatched ||
      result.eligibility.requiredFieldsMissing.length > 0 ||
      result.eligibility.conflicts.length > 0;

    const decisionsJson = {
      invoice_id: invoice.id,
      vendor_id: invoice.vendorId,
      ruleset_id: ruleset.id,
      rule_version_id: activeVersion.id,
      applied: true,
      needs_review: needsReview,
      eligibility: result.eligibility,
      decisions: result.decisions,
      proposed: result.proposed,
    } as Prisma.InputJsonValue;

    const updated = await prisma.$transaction(async (tx) => {
      // Apply line updates deterministically (merge dimensions; overwrite GL when rule proposes one).
      for (const u of result.proposed.lineUpdates) {
        const line = invoice.lines[u.line_index];
        if (!line) continue;
        const nextDims = { ...(line.dimensionValues as any) };
        if (u.set_dimensions) {
          for (const [k, v] of Object.entries(u.set_dimensions)) nextDims[k] = v;
        }
        await tx.invoiceLine.update({
          where: { id: line.id },
          data: {
            glAccountNo: u.set_gl ?? line.glAccountNo,
            dimensionValues: nextDims,
            canonicalJson: {
              line_index: u.line_index,
              description: line.description ?? null,
              qty: toNumber(line.quantity),
              unit_price: toNumber(line.unitCost),
              amount: toNumber(line.lineAmount),
            } as any,
          },
        });
      }

      const inv = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: needsReview ? "needs_review" : invoice.status === "pending_approval" ? invoice.status : "draft",
          recommendedApprovalPolicy: result.proposed.approvalPolicy ?? undefined,
          canonicalJson: canonical as any,
        },
      });

      const log = await tx.ruleApplyLog.create({
        data: {
          firmId,
          invoiceId: invoice.id,
          ruleVersionId: activeVersion.id,
          decisionsJson,
          appliedBy: userId,
        },
      });

      return { invoice: inv, logId: log.id };
    });

    return NextResponse.json({ ...result, invoice: updated.invoice, ruleApplyLogId: updated.logId }, { status: 200 });
  } catch (err) {
    console.error("Failed to apply rules", err);
    const message = err instanceof Error ? err.message : "Failed to apply rules";
    const status = message.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
