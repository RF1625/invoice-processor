import type { MatchType } from "@prisma/client";

export type VendorInput = {
  id: string;
  vendorNo: string;
  name: string;
  gstNumber?: string | null;
  defaultCurrency?: string | null;
  defaultDimensions?: Record<string, string> | null;
  active: boolean;
};

export type GlAccountInput = { id: string; no: string; name: string; type?: string | null };
export type DimensionInput = { id: string; code: string; valueCode: string; valueName: string; active: boolean };
export type RuleInput = {
  id: string;
  vendorId: string;
  priority: number;
  matchType: MatchType;
  matchValue?: string | null;
  glAccountNo?: string | null;
  dimensionOverrides?: Record<string, string> | null;
  active: boolean;
  comment?: string | null;
  vendorName?: string | null;
};
export type RunInput = {
  id: string;
  status: string;
  vendorName?: string | null;
  vendorNo?: string | null;
  fileName?: string | null;
  createdAt?: string | null;
  error?: string | null;
};
export type InvoiceApprovalInput = { id: string; status: string; comment?: string | null; actedAt?: string | null; createdAt: string };
export type InvoiceApproverInput = { id: string; name: string | null; email: string };
export type InvoiceInput = {
  id: string;
  invoiceNo?: string | null;
  vendorName?: string | null;
  status: string;
  currencyCode?: string | null;
  totalAmount: number;
  approvals: InvoiceApprovalInput[];
  approvalApprover?: InvoiceApproverInput | null;
};

export type DatabaseSnapshot = {
  vendors: VendorInput[];
  glAccounts: GlAccountInput[];
  dimensions: DimensionInput[];
  rules: RuleInput[];
  runs: RunInput[];
  invoices: InvoiceInput[];
};

export const emptyDatabaseSnapshot: DatabaseSnapshot = {
  vendors: [],
  glAccounts: [],
  dimensions: [],
  rules: [],
  runs: [],
  invoices: [],
};

export const normalizeDatabaseSnapshot = (payload: {
  vendorsJson: any;
  glJson: any;
  dimJson: any;
  ruleJson: any;
  runJson: any;
  invoiceJson: any;
}): DatabaseSnapshot => ({
  vendors: (payload.vendorsJson.vendors ?? []).map((v: any) => ({
    id: v.id,
    vendorNo: v.vendorNo,
    name: v.name,
    gstNumber: v.gstNumber,
    defaultCurrency: v.defaultCurrency,
    defaultDimensions: v.defaultDimensions ?? null,
    active: v.active,
  })),
  glAccounts: (payload.glJson.glAccounts ?? []).map((g: any) => ({
    id: g.id,
    no: g.no,
    name: g.name,
    type: g.type,
  })),
  dimensions: (payload.dimJson.dimensions ?? []).map((d: any) => ({
    id: d.id,
    code: d.code,
    valueCode: d.valueCode,
    valueName: d.valueName,
    active: d.active,
  })),
  rules: (payload.ruleJson.rules ?? []).map((r: any) => ({
    id: r.id,
    vendorId: r.vendorId,
    priority: r.priority,
    matchType: r.matchType as MatchType,
    matchValue: r.matchValue,
    glAccountNo: r.glAccountNo,
    dimensionOverrides: r.dimensionOverrides ?? null,
    active: r.active,
    comment: r.comment,
    vendorName: r.vendor?.name ?? null,
  })),
  runs: (payload.runJson.runs ?? []).map((r: any) => ({
    id: r.id,
    status: r.status,
    vendorName: r.vendorName ?? null,
    vendorNo: r.vendorNo ?? null,
    fileName: r.fileName ?? null,
    createdAt: r.createdAt ?? null,
    error: r.error ?? null,
  })),
  invoices: (payload.invoiceJson.invoices ?? []).map((inv: any) => ({
    id: inv.id,
    invoiceNo: inv.invoiceNo,
    vendorName: inv.vendor?.name ?? inv.vendorName ?? null,
    status: inv.status,
    currencyCode: inv.currencyCode,
    totalAmount: Number(inv.totalAmount ?? 0),
    approvals: (inv.approvals ?? []).map((a: any) => ({
      id: a.id,
      status: a.status,
      comment: a.comment,
      actedAt: a.actedAt ?? a.acted_at ?? null,
      createdAt: (a.createdAt ?? a.created_at)?.toString?.() ?? "",
    })),
    approvalApprover: inv.approvalApprover
      ? {
          id: inv.approvalApprover.id,
          name: inv.approvalApprover.name ?? null,
          email: inv.approvalApprover.email,
        }
      : null,
  })),
});
