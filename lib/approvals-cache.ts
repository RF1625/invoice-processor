export type ApprovalUserRow = {
  userId: string;
  role: string;
  email: string;
  name: string | null;
  setup: {
    approverUserId: string | null;
    approvalLimit: string | null;
    substituteUserId: string | null;
    substituteFrom: string | null;
    substituteTo: string | null;
    active: boolean;
  } | null;
};

export type ApprovalSettingsCache = {
  users: ApprovalUserRow[];
  forbidden: boolean;
};

export type ApprovalInboxItem = {
  stepId: string;
  scopeId: string;
  stepIndex: number;
  invoice: {
    id: string;
    invoiceNo: string | null;
    status: string;
    totalAmount: unknown;
    currencyCode: string | null;
    invoiceDate: string | null;
    dueDate: string | null;
    vendorName: string | null;
  };
  scope: {
    id: string;
    scopeType: string;
    scopeKey: string | null;
    amount: unknown;
    currencyCode: string | null;
    requestedAt: string;
    requester: { id: string; name: string | null; email: string } | null;
  };
  approver: { id: string; name: string | null; email: string };
  actingAsSubstitute: boolean;
};

export type ApiApprovalSetup = {
  approverUserId?: string | null;
  approvalLimit?: unknown;
  substituteUserId?: string | null;
  substituteFrom?: string | Date | null;
  substituteTo?: string | Date | null;
  active?: boolean | null;
};

export type ApiApprovalUser = {
  userId: string;
  role: string;
  email: string;
  name?: string | null;
  setup?: ApiApprovalSetup | null;
};

const normalizeDate = (raw: unknown) => {
  if (!raw) return null;
  const d = new Date(raw as string);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
};

export const normalizeApprovalUsers = (raw: ApiApprovalUser[]): ApprovalUserRow[] =>
  raw.map((u) => ({
    userId: u.userId,
    role: u.role,
    email: u.email,
    name: u.name ?? null,
    setup: u.setup
      ? {
          approverUserId: u.setup.approverUserId ?? null,
          approvalLimit: u.setup.approvalLimit == null ? null : u.setup.approvalLimit.toString?.() ?? String(u.setup.approvalLimit),
          substituteUserId: u.setup.substituteUserId ?? null,
          substituteFrom: normalizeDate(u.setup.substituteFrom),
          substituteTo: normalizeDate(u.setup.substituteTo),
          active: u.setup.active ?? true,
        }
      : null,
  }));
