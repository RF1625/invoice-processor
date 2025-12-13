import { Prisma } from "@prisma/client";

export type ApprovalAction = "approve" | "reject";

export class ApprovalEngineError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

const now = () => new Date();

const isSubstituteActive = (setup: {
  active: boolean;
  substituteUserId: string | null;
  substituteFrom: Date | null;
  substituteTo: Date | null;
}) => {
  if (!setup.active) return false;
  if (!setup.substituteUserId) return false;
  const t = now().getTime();
  const from = setup.substituteFrom?.getTime() ?? Number.NEGATIVE_INFINITY;
  const to = setup.substituteTo?.getTime() ?? Number.POSITIVE_INFINITY;
  return t >= from && t <= to;
};

const normalizeInvoiceAmount = (amount: unknown) => {
  if (amount instanceof Prisma.Decimal) return amount;
  if (typeof amount === "number") return new Prisma.Decimal(amount);
  if (typeof amount === "string" && amount.trim()) return new Prisma.Decimal(amount);
  return new Prisma.Decimal(0);
};

async function getApprovalSetup(tx: Prisma.TransactionClient, firmId: string, userId: string) {
  return tx.approvalUserSetup.findUnique({
    where: { firmId_userId: { firmId, userId } },
    select: {
      userId: true,
      approverUserId: true,
      approvalLimit: true,
      active: true,
      substituteUserId: true,
      substituteFrom: true,
      substituteTo: true,
    },
  });
}

function limitCoversAmount(limit: Prisma.Decimal | null, amount: Prisma.Decimal) {
  if (!limit) return true; // NULL = unlimited
  return limit.gte(amount);
}

export async function buildApproverChain(
  tx: Prisma.TransactionClient,
  opts: { firmId: string; requesterUserId: string; amount: Prisma.Decimal },
) {
  const visited = new Set<string>();
  const approverChain: string[] = [];

  let currentUserId = opts.requesterUserId;

  for (let depth = 0; depth < 50; depth++) {
    if (visited.has(currentUserId)) {
      throw new ApprovalEngineError(400, "Approval chain contains a loop");
    }
    visited.add(currentUserId);

    const currentSetup = await getApprovalSetup(tx, opts.firmId, currentUserId);
    const nextApproverId = currentSetup?.approverUserId ?? null;
    if (!nextApproverId) {
      throw new ApprovalEngineError(
        400,
        depth === 0 ? "No approver configured for requester" : "Approval chain is missing an approver",
      );
    }

    approverChain.push(nextApproverId);

    const approverSetup = await getApprovalSetup(tx, opts.firmId, nextApproverId);
    if (!approverSetup) {
      throw new ApprovalEngineError(400, "Approver is missing approval setup");
    }
    if (!approverSetup.active) {
      throw new ApprovalEngineError(400, "Approver is not active for approvals");
    }

    if (limitCoversAmount(approverSetup.approvalLimit ?? null, opts.amount)) {
      return approverChain;
    }

    currentUserId = nextApproverId;
  }

  throw new ApprovalEngineError(400, "Approval chain is too deep");
}

export async function ensureActiveInvoiceApprovalPlan(
  tx: Prisma.TransactionClient,
  opts: { firmId: string; invoiceId: string; requesterUserId: string },
) {
  const existing = await tx.invoiceApprovalPlan.findFirst({
    where: { firmId: opts.firmId, invoiceId: opts.invoiceId, status: "active" },
    include: {
      scopes: {
        include: {
          steps: { orderBy: { stepIndex: "asc" } },
        },
      },
    },
  });
  if (existing) return existing;

  const invoice = await tx.invoice.findFirst({
    where: { id: opts.invoiceId, firmId: opts.firmId },
    select: { id: true, status: true, totalAmount: true, currencyCode: true },
  });
  if (!invoice) throw new ApprovalEngineError(404, "Invoice not found");
  if (invoice.status === "posted") throw new ApprovalEngineError(400, "Invoice is already posted");

  const amount = normalizeInvoiceAmount(invoice.totalAmount);
  const chain = await buildApproverChain(tx, { firmId: opts.firmId, requesterUserId: opts.requesterUserId, amount });

  let created;
  try {
    created = await tx.invoiceApprovalPlan.create({
      data: {
        firmId: opts.firmId,
        invoiceId: invoice.id,
        requesterUserId: opts.requesterUserId,
        status: "active",
        scopes: {
          create: {
            firmId: opts.firmId,
            invoiceId: invoice.id,
            scopeType: "invoice_total",
            scopeKey: null,
            amount,
            currencyCode: invoice.currencyCode ?? null,
            status: "active",
            steps: {
              create: chain.map((approverUserId, idx) => ({
                firmId: opts.firmId,
                invoiceId: invoice.id,
                stepIndex: idx + 1,
                approverUserId,
                status: idx === 0 ? "pending" : "blocked",
              })),
            },
          },
        },
      },
      include: {
        scopes: {
          include: {
            steps: { orderBy: { stepIndex: "asc" } },
          },
        },
      },
    });
  } catch (err) {
    // Idempotency under concurrency: if another request created the active plan first, return it.
    if ((err as { code?: string })?.code === "P2002") {
      const raced = await tx.invoiceApprovalPlan.findFirst({
        where: { firmId: opts.firmId, invoiceId: opts.invoiceId, status: "active" },
        include: {
          scopes: { include: { steps: { orderBy: { stepIndex: "asc" } } } },
        },
      });
      if (raced) return raced;
    }
    throw err;
  }

  await tx.invoice.update({
    where: { id: invoice.id },
    data: { status: "pending_approval" },
  });

  await tx.invoiceApproval.create({
    data: {
      firmId: opts.firmId,
      invoiceId: invoice.id,
      userId: opts.requesterUserId,
      status: "pending",
      comment: "Sent for approval",
      actedAt: null,
    },
  });

  return created;
}

async function resolveAllowedActorsForApprover(
  tx: Prisma.TransactionClient,
  opts: { firmId: string; approverUserId: string },
) {
  const setup = await getApprovalSetup(tx, opts.firmId, opts.approverUserId);
  const actors = new Set<string>([opts.approverUserId]);
  if (setup && isSubstituteActive(setup)) {
    actors.add(setup.substituteUserId as string);
  }
  return actors;
}

export async function actOnInvoiceApproval(
  tx: Prisma.TransactionClient,
  opts: {
    firmId: string;
    invoiceId: string;
    actorUserId: string;
    action: ApprovalAction;
    comment?: string | null;
    scopeId?: string | null;
  },
) {
  const plan = await tx.invoiceApprovalPlan.findFirst({
    where: { firmId: opts.firmId, invoiceId: opts.invoiceId, status: "active" },
    select: { id: true, status: true },
  });
  if (!plan) throw new ApprovalEngineError(400, "No active approval request for this invoice");

  const pendingSteps = await tx.invoiceApprovalStep.findMany({
    where: {
      firmId: opts.firmId,
      invoiceId: opts.invoiceId,
      status: "pending",
      scope: {
        is: { planId: plan.id, status: "active" },
      },
    },
    select: { id: true, scopeId: true, approverUserId: true },
    orderBy: [{ scopeId: "asc" }, { stepIndex: "asc" }],
  });

  if (pendingSteps.length === 0) {
    throw new ApprovalEngineError(409, "No pending approval step");
  }

  const eligibleStepIds: string[] = [];
  for (const step of pendingSteps) {
    if (opts.scopeId && step.scopeId !== opts.scopeId) continue;
    const allowedActors = await resolveAllowedActorsForApprover(tx, {
      firmId: opts.firmId,
      approverUserId: step.approverUserId,
    });
    if (allowedActors.has(opts.actorUserId)) {
      eligibleStepIds.push(step.id);
    }
  }

  if (opts.scopeId && eligibleStepIds.length === 0) {
    throw new ApprovalEngineError(403, "You are not allowed to act on this approval");
  }
  if (!opts.scopeId && eligibleStepIds.length > 1) {
    throw new ApprovalEngineError(400, "Multiple pending approvals require a scopeId");
  }
  if (eligibleStepIds.length === 0) {
    throw new ApprovalEngineError(403, "You are not allowed to act on this approval");
  }

  const stepId = eligibleStepIds[0];
  const actedAt = now();
  const nextStatus = opts.action === "approve" ? "approved" : "rejected";

  const updatedCount = await tx.invoiceApprovalStep.updateMany({
    where: { id: stepId, firmId: opts.firmId, invoiceId: opts.invoiceId, status: "pending" },
    data: {
      status: nextStatus,
      actedAt,
      actedByUserId: opts.actorUserId,
      comment: opts.comment ?? null,
    },
  });

  if (updatedCount.count !== 1) {
    throw new ApprovalEngineError(409, "Approval step already acted on");
  }

  await tx.invoiceApproval.create({
    data: {
      firmId: opts.firmId,
      invoiceId: opts.invoiceId,
      userId: opts.actorUserId,
      status: nextStatus,
      comment: opts.comment ?? null,
      actedAt,
    },
  });

  const actedStep = await tx.invoiceApprovalStep.findUnique({
    where: { id: stepId },
    select: { scopeId: true },
  });
  if (!actedStep) throw new ApprovalEngineError(500, "Approval step not found after update");

  if (opts.action === "reject") {
    await tx.invoiceApprovalPlan.update({
      where: { id: plan.id },
      data: { status: "rejected", rejectedAt: actedAt },
    });
    await tx.invoiceApprovalScope.updateMany({
      where: { planId: plan.id, status: "active" },
      data: { status: "canceled", canceledAt: actedAt },
    });
    await tx.invoiceApprovalStep.updateMany({
      where: {
        invoiceId: opts.invoiceId,
        firmId: opts.firmId,
        scope: { is: { planId: plan.id } },
        status: { in: ["blocked", "pending"] },
      },
      data: { status: "canceled" },
    });
    const invoice = await tx.invoice.update({
      where: { id: opts.invoiceId },
      data: { status: "rejected" },
    });
    return { invoiceStatus: invoice.status, planStatus: "rejected" as const };
  }

  // Approve: activate next step in this scope, or complete scope.
  const nextBlocked = await tx.invoiceApprovalStep.findFirst({
    where: { scopeId: actedStep.scopeId, status: "blocked" },
    orderBy: { stepIndex: "asc" },
    select: { id: true },
  });

  if (nextBlocked) {
    await tx.invoiceApprovalStep.update({ where: { id: nextBlocked.id }, data: { status: "pending" } });
  } else {
    await tx.invoiceApprovalScope.update({
      where: { id: actedStep.scopeId },
      data: { status: "completed", completedAt: actedAt },
    });
  }

  const remainingScopes = await tx.invoiceApprovalScope.count({
    where: { planId: plan.id, status: "active" },
  });

  if (remainingScopes === 0) {
    await tx.invoiceApprovalPlan.update({
      where: { id: plan.id },
      data: { status: "completed", completedAt: actedAt },
    });
    const invoice = await tx.invoice.update({
      where: { id: opts.invoiceId },
      data: { status: "approved" },
    });
    return { invoiceStatus: invoice.status, planStatus: "completed" as const };
  }

  const invoice = await tx.invoice.update({
    where: { id: opts.invoiceId },
    data: { status: "pending_approval" },
  });
  return { invoiceStatus: invoice.status, planStatus: "active" as const };
}
