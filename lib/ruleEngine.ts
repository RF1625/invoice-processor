import { Prisma, type MatchType, type VendorRule } from "@prisma/client";
import { prisma } from "./prisma";
import { type NavPurchaseInvoicePayload } from "./navClient";
import { suggestVendorMatches } from "./vendorMatching";
import { applyDslDeterministically, type CanonicalInvoice } from "./rulesDsl";

export class ValidationError extends Error {
  statusCode = 400;
}

export type ParsedInvoiceItem = {
  description: string | null;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  glAccountNo?: string | null;
  dimensions?: Record<string, string>;
};

export type ParsedInvoice = {
  vendorName: string | null;
  vendorAddress: string | null;
  gstNumber?: string | null;
  customerName: string | null;
  customerAddress: string | null;
  invoiceId: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  subTotal?: number | null;
  taxAmount?: number | null;
  taxRate?: number | null;
  amountDue?: number | null;
  invoiceTotal: number | null;
  currencyCode?: string | null;
  bankAccount?: string | null;
  paymentTerms?: string | null;
  items: ParsedInvoiceItem[];
  confidence?: number;
  pageRange?: number[];
  navVendorNo?: string | null;
};

export type RuleApplication = {
  lineIndex: number;
  ruleId?: string | null;
  matchType?: MatchType | null;
  matchValue?: string | null;
  glAccountNo?: string | null;
  dimensions?: Record<string, string>;
  matched: boolean;
  note?: string;
};

const parseTokens = (raw: string | null | undefined) =>
  (raw ?? "")
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean);

const normalizeVendorName = (raw: string) =>
  raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();

const normalizeNzGstNumber = (raw?: string | null) => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return trimmed;
  const normalized = digits.length === 8 ? `0${digits}` : digits;
  if (normalized.length === 9) {
    return `${normalized.slice(0, 3)}-${normalized.slice(3, 6)}-${normalized.slice(6)}`;
  }
  return trimmed;
};

const isLikelyJunkVendorName = (name: string) => {
  const normalized = normalizeVendorName(name).toLowerCase();
  if (normalized.length < 3) return true;
  if (/^\d+$/.test(normalized)) return true;

  // Looser normalization to catch punctuation-only variants like "Tax Invoice:" or "Tax-Invoice".
  const loose = normalized
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  const junk = new Set([
    "invoice",
    "tax invoice",
    "gst invoice",
    "vat invoice",
    "statement",
    "receipt",
    "bill",
  ]);

  if (junk.has(loose)) return true;
  if (/^(invoice|statement|receipt|bill)(\s+\d+)?$/.test(loose)) return true;
  if (/^(tax|gst|vat)\s*invoice(\s+\d+)?$/.test(loose)) return true;

  return false;
};

const shouldAutoCreateVendorFromInvoice = (params: {
  vendorText: string;
  invoiceConfidence: number | null | undefined;
  topCandidateScore: number | null;
}) => {
  const vendorText = normalizeVendorName(params.vendorText);
  if (!vendorText) return false;
  if (isLikelyJunkVendorName(vendorText)) return false;
  if (params.invoiceConfidence == null || params.invoiceConfidence < 0.9) return false;
  // Only auto-create when we don't have a plausible existing match.
  if (params.topCandidateScore != null && params.topCandidateScore >= 0.6) return false;
  return true;
};

export const matchesVendorRule = (rule: VendorRule, description: string, amount: number | null | undefined) => {
  if (!rule.active) return false;
  const normalized = description.toLowerCase();

  switch (rule.matchType) {
    case "description_contains": {
      const tokens = parseTokens(rule.matchValue);
      return tokens.some((token) => normalized.includes(token.toLowerCase()));
    }
    case "description_regex": {
      if (!rule.matchValue) return false;
      try {
        const regex = new RegExp(rule.matchValue, "i");
        return regex.test(description);
      } catch (err) {
        console.warn("Invalid regex in rule", rule.id, err);
        return false;
      }
    }
    case "amount_equals": {
      if (amount == null) return false;
      const target = rule.matchValue ? Number(rule.matchValue) : NaN;
      if (Number.isNaN(target)) return false;
      return Math.abs(amount - target) < 0.0001;
    }
    case "amount_lt": {
      if (amount == null) return false;
      const target = rule.matchValue ? Number(rule.matchValue) : NaN;
      if (Number.isNaN(target)) return false;
      return amount < target;
    }
    case "amount_lte": {
      if (amount == null) return false;
      const target = rule.matchValue ? Number(rule.matchValue) : NaN;
      if (Number.isNaN(target)) return false;
      return amount <= target;
    }
    case "amount_gt": {
      if (amount == null) return false;
      const target = rule.matchValue ? Number(rule.matchValue) : NaN;
      if (Number.isNaN(target)) return false;
      return amount > target;
    }
    case "amount_gte": {
      if (amount == null) return false;
      const target = rule.matchValue ? Number(rule.matchValue) : NaN;
      if (Number.isNaN(target)) return false;
      return amount >= target;
    }
    case "always":
      return true;
    default:
      return false;
  }
};

const validateNavPayload = (payload: NavPurchaseInvoicePayload | null) => {
  if (!payload) return null;
  const errors: string[] = [];
  if (!payload.vendorNo) errors.push("vendorNo is required");
  if (!payload.lines.length) errors.push("at least one invoice line is required");
  payload.lines.forEach((line, idx) => {
    if (!line.glAccountNo || line.glAccountNo === "UNMAPPED") {
      errors.push(`line ${idx + 1} missing GL account`);
    }
    if (line.amount == null || Number.isNaN(line.amount)) {
      errors.push(`line ${idx + 1} missing amount`);
    }
  });
  if (errors.length) {
    throw new ValidationError(`Invoice validation failed: ${errors.join("; ")}`);
  }
  // Mirror back any dimension validation if needed later; for now ensure merged dims are strings
  payload.lines.forEach((line, idx) => {
    if (line.dimensions) {
      Object.entries(line.dimensions).forEach(([k, v]) => {
        if (typeof v !== "string" || v.length === 0) {
          errors.push(`line ${idx + 1} has invalid dimension ${k}`);
        }
      });
    }
  });
  if (errors.length) {
    throw new ValidationError(`Invoice validation failed: ${errors.join("; ")}`);
  }
  return payload;
};

export async function applyVendorRulesAndLog(params: {
  invoice: ParsedInvoice;
  navVendorNo?: string | null;
  fileName?: string | null;
  firmId: string;
  azureRawJson?: Prisma.InputJsonValue | null;
  fileMeta?: {
    fileName: string;
    storagePath?: string;
    sizeBytes?: number;
    contentType?: string | null;
    checksum?: string | null;
  };
}): Promise<{
  invoice: ParsedInvoice;
  navPayload: NavPurchaseInvoicePayload | null;
  ruleApplications: RuleApplication[];
  runId: string;
  invoiceId: string;
  navValidationError: string | null;
}> {
  const { invoice, navVendorNo, fileName, firmId, fileMeta, azureRawJson } = params;

  const vendor =
    navVendorNo != null
      ? await prisma.vendor.findUnique({
          where: { firmId_vendorNo: { firmId, vendorNo: navVendorNo } },
          include: { rules: { where: { active: true }, orderBy: { priority: "asc" } } },
        })
      : null;

  const vendorText = normalizeVendorName(invoice.vendorName ?? "");
  const vendorMatch = vendorText
    ? await suggestVendorMatches({ firmId, vendorText, take: 5 })
    : { candidates: [], normalized: "", hasExactMatch: false };
  const topCandidateScore =
    vendorMatch.candidates.length > 0 ? vendorMatch.candidates[0].score : null;
  const wantsAutoCreateVendor =
    !vendor &&
    !vendorMatch.hasExactMatch &&
    shouldAutoCreateVendorFromInvoice({
      vendorText,
      invoiceConfidence: invoice.confidence ?? null,
      topCandidateScore,
    });

  // Only auto-match on deterministic, normalized exact match (score=1.0).
  const autoMatchedVendorId =
    !vendor && vendorMatch.candidates.length && vendorMatch.candidates[0].score >= 1
      ? vendorMatch.candidates[0].vendorId
      : null;
  const vendorByAlias =
    !vendor && autoMatchedVendorId
      ? await prisma.vendor.findFirst({
          where: { id: autoMatchedVendorId, firmId },
          include: { rules: { where: { active: true }, orderBy: { priority: "asc" } } },
        })
      : null;

  // If no match, optionally auto-create a vendor record (kept in needs_review until confirmed).
  let resolvedVendor = vendor ?? vendorByAlias;
  type ResolvedVendor = typeof resolvedVendor;
  let autoCreatedVendor = false;
  if (!resolvedVendor && wantsAutoCreateVendor) {
    let created: ResolvedVendor = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        created = await prisma.$transaction(async (tx) => {
          const lastAuto = await tx.vendor.findFirst({
            where: { firmId, vendorNo: { startsWith: "AUTO-" } },
            orderBy: { vendorNo: "desc" },
            select: { vendorNo: true },
          });

          const lastNum = lastAuto?.vendorNo
            ? Number(lastAuto.vendorNo.replace(/^AUTO-/, ""))
            : 0;
          const nextNum = Number.isFinite(lastNum) ? lastNum + 1 : 1;
          const vendorNo = `AUTO-${String(nextNum).padStart(6, "0")}`;

          const newVendor = await tx.vendor.create({
            data: {
              firmId,
              vendorNo,
              name: vendorText,
              gstNumber: normalizeNzGstNumber(invoice.gstNumber),
              defaultCurrency: invoice.currencyCode ?? null,
              active: true,
            },
            include: { rules: { where: { active: true }, orderBy: { priority: "asc" } } },
          });

          await tx.vendorAlias.create({
            data: {
              firmId,
              vendorId: newVendor.id,
              aliasText: vendorText,
              confidenceHint: new Prisma.Decimal(1),
            },
          });

          return newVendor;
        });
        break;
      } catch (err) {
        const code = (err as any)?.code;
        if (code === "P2002" && attempt < 2) continue; // unique constraint collision; retry
        throw err;
      }
    }
    resolvedVendor = created;
    autoCreatedVendor = true;
  }

  const resolvedVendorNo = resolvedVendor?.vendorNo ?? navVendorNo ?? null;
  const defaultDims = (resolvedVendor?.defaultDimensions as Record<string, string> | null) ?? {};
  const rules = resolvedVendor?.rules ?? [];

  const ruleApplications: RuleApplication[] = [];
  let itemsWithAssignments = invoice.items.map((item, idx) => {
    const description = item.description ?? "";
    const amount = item.amount ?? item.unitPrice ?? null;
    const rule = rules.find((r) => matchesVendorRule(r, description, amount));
    const mergedDims = {
      ...defaultDims,
      ...(rule?.dimensionOverrides as Record<string, string> | null | undefined),
      ...(item.dimensions ?? {}),
    };
    const glAccountNo = rule?.glAccountNo ?? item.glAccountNo ?? null;

    ruleApplications.push({
      lineIndex: idx,
      ruleId: rule?.id ?? null,
      matchType: rule?.matchType ?? null,
      matchValue: rule?.matchValue ?? null,
      glAccountNo,
      dimensions: Object.keys(mergedDims).length ? mergedDims : undefined,
      matched: Boolean(rule),
      note: rule?.comment ?? undefined,
    });

    return {
      ...item,
      glAccountNo,
      dimensions: Object.keys(mergedDims).length ? mergedDims : undefined,
    };
  });

  // Prefer versioned rulesets (DSL) over legacy vendor_rules when present.
  const activeRuleset =
    resolvedVendor?.id != null
      ? await prisma.ruleset.findFirst({
          where: { firmId, vendorId: resolvedVendor.id },
          include: { activeVersion: true },
        })
      : null;

  const appliedDslResult =
    activeRuleset?.activeVersion && resolvedVendor
      ? (() => {
          const canonical: CanonicalInvoice = {
            invoice_id: invoice.invoiceId ?? "unknown",
            vendor_id: resolvedVendor.id,
            status: "draft",
            currency: invoice.currencyCode ?? null,
            invoice_date: invoice.invoiceDate ?? null,
            total:
              invoice.invoiceTotal ??
              invoice.amountDue ??
              itemsWithAssignments.reduce((sum, item) => sum + (item.amount ?? 0), 0),
            lines: itemsWithAssignments.map((l, idx) => ({
              line_index: idx,
              description: l.description ?? null,
              qty: l.quantity ?? null,
              unit_price: l.unitPrice ?? null,
              amount: l.amount ?? null,
            })),
          };
          return applyDslDeterministically({
            invoice: canonical,
            dsl: activeRuleset.activeVersion.dslJson as any,
            ruleVersionId: activeRuleset.activeVersion.id,
            vendorMatchStatus:
              resolvedVendor && !autoCreatedVendor ? "matched" : vendorText ? "suggested" : "unmatched",
            vendorMatchConfidence: resolvedVendor && !autoCreatedVendor ? 1 : null,
          });
        })()
      : null;

  if (appliedDslResult) {
    // Override line assignments based on DSL engine output (still deterministic).
    itemsWithAssignments = itemsWithAssignments.map((item, idx) => {
      const update = appliedDslResult.proposed.lineUpdates.find((u) => u.line_index === idx);
      const mergedDims = {
        ...defaultDims,
        ...(update?.set_dimensions ?? {}),
        ...(item.dimensions ?? {}),
      };
      return {
        ...item,
        glAccountNo: update?.set_gl ?? item.glAccountNo ?? null,
        dimensions: Object.keys(mergedDims).length ? mergedDims : undefined,
      };
    });
  }

  // For auto-created vendors we intentionally do not build a NAV payload yet; coding happens after review/confirmation.
  const navPayload: NavPurchaseInvoicePayload | null = resolvedVendorNo && !autoCreatedVendor
    ? {
        vendorNo: resolvedVendorNo,
        vendorInvoiceNo: invoice.invoiceId ?? undefined,
        postingDate: invoice.invoiceDate ?? undefined,
        dueDate: invoice.dueDate ?? undefined,
        currencyCode: invoice.currencyCode ?? vendor?.defaultCurrency ?? undefined,
        dimensions: Object.keys(defaultDims).length ? defaultDims : undefined,
        lines: itemsWithAssignments.map((line) => ({
          description: line.description ?? "Unspecified",
          quantity: line.quantity ?? 0,
          directUnitCost: line.unitPrice ?? line.amount ?? 0,
          amount: line.amount ?? 0,
          glAccountNo: line.glAccountNo ?? "UNMAPPED",
          dimensions: line.dimensions,
        })),
      }
    : null;

  let validatedPayload: NavPurchaseInvoicePayload | null = null;
  let navValidationError: string | null = null;
  try {
    validatedPayload = validateNavPayload(navPayload);
  } catch (err) {
    navValidationError = err instanceof Error ? err.message : "Invoice validation failed";
  }
  const hasNavValidationError = Boolean(navValidationError);
  const invoicePayloadJson: Prisma.InputJsonValue = invoice as Prisma.InputJsonValue;
  const ruleApplicationsJson: Prisma.InputJsonValue = ruleApplications as Prisma.InputJsonValue;
  const navPayloadJson: Prisma.InputJsonValue | undefined = navPayload
    ? (navPayload as Prisma.InputJsonValue)
    : undefined;

  const totalAmount =
    invoice.invoiceTotal ??
    itemsWithAssignments.reduce((sum, item) => sum + (item.amount ?? 0), 0);
  const taxAmount = invoice.taxAmount ?? 0;
  const netAmount = Number(totalAmount) - Number(taxAmount);

  const { runId, invoiceId } = await prisma.$transaction(async (tx) => {
    const run = await tx.run.create({
      data: {
        firmId,
        vendorId: resolvedVendor?.id ?? null,
        vendorNo: resolvedVendorNo,
        fileName: fileName ?? null,
        status: resolvedVendor && !autoCreatedVendor && !hasNavValidationError ? "processed" : "needs_review",
        error: navValidationError,
        invoicePayload: {
          ...(invoice as any),
          vendorMatch: {
            status:
              resolvedVendor && !autoCreatedVendor ? "matched" : vendorText ? "suggested" : "unmatched",
            normalized: vendorMatch.normalized,
            candidates: vendorMatch.candidates,
            autoCreatedVendor: autoCreatedVendor || undefined,
          },
        } as Prisma.InputJsonValue,
        ruleApplications: ruleApplicationsJson,
        navPayload: navPayloadJson,
      },
      select: { id: true },
    });

    const invoiceRecord = await tx.invoice.create({
      data: {
        firmId,
        vendorId: resolvedVendor?.id ?? null,
        runId: run.id,
        vendorNo: resolvedVendorNo,
        invoiceNo: invoice.invoiceId ?? null,
        invoiceDate: invoice.invoiceDate ? new Date(invoice.invoiceDate) : null,
        dueDate: invoice.dueDate ? new Date(invoice.dueDate) : null,
        currencyCode: validatedPayload?.currencyCode ?? invoice.currencyCode ?? null,
        status:
          !resolvedVendor || autoCreatedVendor || hasNavValidationError
            ? "needs_review"
            : appliedDslResult &&
                (!appliedDslResult.eligibility.vendorMatched ||
                  appliedDslResult.eligibility.requiredFieldsMissing.length ||
                  appliedDslResult.eligibility.conflicts.length)
              ? "needs_review"
              : "draft",
        totalAmount: new Prisma.Decimal(totalAmount ?? 0),
        taxAmount: new Prisma.Decimal(taxAmount ?? 0),
        netAmount: new Prisma.Decimal(netAmount),
        originalPayload: invoicePayloadJson,
        canonicalJson: {
          ...(invoice as any),
          vendorMatch: {
            status:
              resolvedVendor && !autoCreatedVendor ? "matched" : vendorText ? "suggested" : "unmatched",
            normalized: vendorMatch.normalized,
            candidates: vendorMatch.candidates,
            autoCreatedVendor: autoCreatedVendor || undefined,
          },
        } as Prisma.InputJsonValue,
        azureRawJson: azureRawJson ?? undefined,
        vendorMatchStatus:
          resolvedVendor && !autoCreatedVendor ? "matched" : vendorText ? "suggested" : "unmatched",
        vendorMatchConfidence: resolvedVendor && !autoCreatedVendor
          ? new Prisma.Decimal(1)
          : vendorMatch.candidates.length
            ? new Prisma.Decimal(vendorMatch.candidates[0].score)
            : null,
        recommendedApprovalPolicy: appliedDslResult?.proposed.approvalPolicy ?? undefined,
        lines: {
          create: itemsWithAssignments.map((line, idx) => ({
            firmId,
            lineNo: idx + 1,
            description: line.description ?? "Unspecified",
            quantity: new Prisma.Decimal(line.quantity ?? 0),
            unitCost: new Prisma.Decimal(line.unitPrice ?? line.amount ?? 0),
            lineAmount: new Prisma.Decimal(line.amount ?? 0),
            glAccountNo: line.glAccountNo ?? undefined,
            dimensionValues: line.dimensions ?? {},
            canonicalJson: {
              description: line.description ?? null,
              quantity: line.quantity ?? null,
              unitPrice: line.unitPrice ?? null,
              amount: line.amount ?? null,
              glAccountNo: line.glAccountNo ?? null,
              dimensions: line.dimensions ?? null,
            } as Prisma.InputJsonValue,
            taxRate: invoice.taxRate != null ? new Prisma.Decimal(invoice.taxRate) : null,
            taxCode: null,
            active: true,
          })),
        },
      },
      select: { id: true },
    });

    if (appliedDslResult && activeRuleset?.activeVersion) {
      await tx.ruleApplyLog.create({
        data: {
          firmId,
          invoiceId: invoiceRecord.id,
          ruleVersionId: activeRuleset.activeVersion.id,
          decisionsJson: {
            invoice_id: invoiceRecord.id,
            vendor_id: resolvedVendor?.id ?? null,
            ruleset_id: activeRuleset.id,
            rule_version_id: activeRuleset.activeVersion.id,
            applied: true,
            needs_review:
              !appliedDslResult.eligibility.vendorMatched ||
              appliedDslResult.eligibility.requiredFieldsMissing.length > 0 ||
              appliedDslResult.eligibility.conflicts.length > 0,
            eligibility: appliedDslResult.eligibility,
            decisions: appliedDslResult.decisions,
            proposed: appliedDslResult.proposed,
          } as Prisma.InputJsonValue,
          appliedBy: null,
        },
      });
    }

    if (fileMeta) {
      await tx.file.create({
        data: {
          firmId,
          runId: run.id,
          invoiceId: invoiceRecord.id,
          fileName: fileMeta.fileName,
          storagePath: fileMeta.storagePath ?? fileMeta.fileName,
          contentType: fileMeta.contentType ?? null,
          sizeBytes: fileMeta.sizeBytes != null ? BigInt(fileMeta.sizeBytes) : null,
          checksum: fileMeta.checksum ?? null,
        },
      });
    }

    return { runId: run.id, invoiceId: invoiceRecord.id };
  });

  return {
    invoice: { ...invoice, navVendorNo: resolvedVendorNo, items: itemsWithAssignments },
    navPayload: navPayload,
    ruleApplications,
    runId,
    invoiceId,
    navValidationError,
  };
}

export const __test__ = {
  isLikelyJunkVendorName,
  shouldAutoCreateVendorFromInvoice,
};
