import { Prisma, type MatchType, type VendorRule } from "@prisma/client";
import { prisma } from "./prisma";
import { type NavPurchaseInvoicePayload } from "./navClient";

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

const matchesRule = (rule: VendorRule, description: string, amount: number | null | undefined) => {
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
    case "always":
      return true;
    default:
      return false;
  }
};

export async function applyVendorRulesAndLog(params: {
  invoice: ParsedInvoice;
  navVendorNo?: string | null;
  fileName?: string | null;
  firmId: string;
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
}> {
  const { invoice, navVendorNo, fileName, firmId, fileMeta } = params;

  const vendor =
    navVendorNo != null
      ? await prisma.vendor.findUnique({
          where: { firmId_vendorNo: { firmId, vendorNo: navVendorNo } },
          include: { rules: { where: { active: true }, orderBy: { priority: "asc" } } },
        })
      : invoice.vendorName
        ? await prisma.vendor.findFirst({
            where: { firmId, name: { equals: invoice.vendorName, mode: "insensitive" } },
            include: { rules: { where: { active: true }, orderBy: { priority: "asc" } } },
          })
        : null;

  const resolvedVendorNo = vendor?.vendorNo ?? navVendorNo ?? null;
  const defaultDims = (vendor?.defaultDimensions as Record<string, string> | null) ?? {};
  const rules = vendor?.rules ?? [];

  const ruleApplications: RuleApplication[] = [];
  const itemsWithAssignments = invoice.items.map((item, idx) => {
    const description = item.description ?? "";
    const amount = item.amount ?? item.unitPrice ?? null;
    const rule = rules.find((r) => matchesRule(r, description, amount));
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

  const navPayload: NavPurchaseInvoicePayload | null = resolvedVendorNo
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

  const invoicePayloadJson: Prisma.InputJsonValue = invoice as Prisma.InputJsonValue;
  const ruleApplicationsJson: Prisma.InputJsonValue = ruleApplications as Prisma.InputJsonValue;
  const navPayloadJson: Prisma.InputJsonValue | undefined = navPayload
    ? (navPayload as Prisma.InputJsonValue)
    : undefined;

  const run = await prisma.run.create({
    data: {
      firmId,
      vendorId: vendor?.id ?? null,
      vendorNo: resolvedVendorNo,
      fileName: fileName ?? null,
      status: navPayload ? "processed" : "missing_vendor",
      error: navPayload ? null : "Vendor not found for rule application",
      invoicePayload: invoicePayloadJson,
      ruleApplications: ruleApplicationsJson,
      navPayload: navPayloadJson,
    },
    select: { id: true },
  });

  if (fileMeta) {
    await prisma.file.create({
      data: {
        firmId,
        runId: run.id,
        fileName: fileMeta.fileName,
        storagePath: fileMeta.storagePath ?? fileMeta.fileName,
        contentType: fileMeta.contentType ?? null,
        sizeBytes: fileMeta.sizeBytes != null ? BigInt(fileMeta.sizeBytes) : null,
        checksum: fileMeta.checksum ?? null,
      },
    });
  }

  return {
    invoice: { ...invoice, navVendorNo: resolvedVendorNo, items: itemsWithAssignments },
    navPayload,
    ruleApplications,
    runId: run.id,
  };
}
