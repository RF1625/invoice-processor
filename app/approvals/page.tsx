"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type InboxItem = {
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

const toText = (value: unknown) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && typeof (value as { toString?: unknown }).toString === "function") {
    return (value as { toString: () => string }).toString();
  }
  return String(value);
};

const fmtMoney = (currency: string | null, amount: unknown) => {
  const text = toText(amount);
  const n = typeof amount === "number" ? amount : Number(text);
  const v = Number.isFinite(n) ? n.toFixed(2) : text;
  return `${currency ?? ""} ${v}`.trim();
};

const fmtDateTime = (raw: string | null | undefined) => {
  if (!raw) return "—";
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : "—";
};

const StatusPill = ({ status }: { status: string }) => {
  const s = (status ?? "").toLowerCase();
  const cls =
    s === "approved"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : s === "rejected"
        ? "border-red-200 bg-red-50 text-red-800"
        : s === "pending_approval" || s === "pending"
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : "border-slate-200 bg-slate-50 text-slate-700";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${cls}`}>{status}</span>;
};

export default function ApprovalsInboxPage() {
  const router = useRouter();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isRefreshing, startTransition] = useTransition();
  const [actingOnId, setActingOnId] = useState<string | null>(null);

  const refresh = () => {
    startTransition(async () => {
      try {
        setError(null);
        const res = await fetch("/api/approvals/inbox", { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (res.status === 401) {
          router.push("/login?redirect=/approvals");
          return;
        }
        if (!res.ok) throw new Error(json.error ?? "Failed to load approvals");
        setItems((json.items ?? []) as InboxItem[]);
        setIsReady(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load approvals");
        setIsReady(true);
      }
    });
  };

  useEffect(() => {
    if (isReady) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady]);

  const contentReady = useMemo(() => isReady || items.length > 0, [isReady, items.length]);

  const act = async (item: InboxItem, status: "approved" | "rejected") => {
    setActingOnId(item.stepId);
    setError(null);
    try {
      const comment =
        status === "rejected"
          ? (window.prompt("Rejection note (optional):") ?? null)
          : (window.prompt("Approval note (optional):") ?? null);

      const res = await fetch(`/api/invoices/${item.invoice.id}/approvals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, comment, scopeId: item.scopeId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed to update approval");
      refresh();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update approval");
    } finally {
      setActingOnId(null);
    }
  };

  return (
    <main className="min-h-screen bg-white p-8 text-slate-900">
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Approvals</p>
            <h1 className="mt-1 text-3xl font-semibold text-slate-900">My approvals</h1>
            <p className="mt-2 text-sm text-slate-600">Approve or reject invoices routed to you (including when you are a substitute approver).</p>
          </div>
          <div className="flex items-center gap-3">
            {isRefreshing && <span className="text-xs text-slate-500">Refreshing…</span>}
            <button
              type="button"
              onClick={refresh}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Refresh
            </button>
          </div>
        </header>

        {error && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{error}</div>}

        {!contentReady ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Loading approvals…</div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">No pending approvals.</div>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => {
              const requesterLabel = item.scope.requester?.name ?? item.scope.requester?.email ?? "—";
              const approverLabel = item.approver.name ?? item.approver.email;
              const disabled = actingOnId === item.stepId;

              return (
                <li key={item.stepId} className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-[260px]">
                      <div className="flex items-center gap-2">
                        <div className="text-base font-semibold text-slate-900">{item.invoice.vendorName ?? "Unknown vendor"}</div>
                        <StatusPill status={item.invoice.status} />
                      </div>
                      <div className="mt-1 text-xs text-slate-600">
                        Invoice {item.invoice.invoiceNo ?? "—"} · {fmtMoney(item.invoice.currencyCode, item.invoice.totalAmount)}
                      </div>
                      <div className="mt-2 text-xs text-slate-600">
                        Requested by <span className="font-semibold text-slate-800">{requesterLabel}</span> · {fmtDateTime(item.scope.requestedAt)}
                      </div>
                      {item.actingAsSubstitute && (
                        <div className="mt-1 text-xs text-slate-600">
                          Acting as substitute for <span className="font-semibold text-slate-800">{approverLabel}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => act(item, "approved")}
                        disabled={disabled}
                        className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => act(item, "rejected")}
                        disabled={disabled}
                        className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Reject
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 text-xs text-slate-600 md:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="font-semibold text-slate-700">Scope</div>
                      <div className="mt-0.5">
                        {item.scope.scopeType}
                        {item.scope.scopeKey ? ` (${item.scope.scopeKey})` : ""}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="font-semibold text-slate-700">Amount</div>
                      <div className="mt-0.5">{fmtMoney(item.scope.currencyCode ?? item.invoice.currencyCode, item.scope.amount)}</div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="font-semibold text-slate-700">Step</div>
                      <div className="mt-0.5">Step {item.stepIndex}</div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
