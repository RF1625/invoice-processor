"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ApprovalsClient, type ApprovalUserRow } from "./ui";

const STORAGE_KEY = "approvals-cache-v1";
let memoryCache: ApprovalUserRow[] | null = null;

type ApiApprovalSetup = {
  approverUserId?: string | null;
  approvalLimit?: unknown;
  substituteUserId?: string | null;
  substituteFrom?: string | Date | null;
  substituteTo?: string | Date | null;
  active?: boolean | null;
};

type ApiApprovalUser = {
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

const normalizeUsers = (raw: ApiApprovalUser[]): ApprovalUserRow[] =>
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

const Forbidden = () => (
  <main className="min-h-screen bg-white p-8 text-slate-900">
    <div className="mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-white p-6">
      <h1 className="text-xl font-semibold text-slate-900">Approvals</h1>
      <p className="mt-1 text-sm text-slate-600">You don&apos;t have access to approval settings.</p>
    </div>
  </main>
);

export default function ApprovalSettingsPage() {
  const router = useRouter();
  const [users, setUsers] = useState<ApprovalUserRow[]>(memoryCache ?? []);
  const [error, setError] = useState<string | null>(null);
  const [isForbidden, setIsForbidden] = useState(false);
  const [isReady, setIsReady] = useState(Boolean(memoryCache));
  const [isRefreshing, startRefresh] = useTransition();

  const refreshData = useCallback(() => {
    startRefresh(async () => {
      try {
        setError(null);
        const res = await fetch("/api/approval-setups", { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (res.status === 401) {
          router.push("/login?redirect=/settings/approvals");
          return;
        }
        if (res.status === 403) {
          setIsForbidden(true);
          setIsReady(true);
          return;
        }
        if (!res.ok) throw new Error(json.error ?? "Failed to load approval setups");

        const normalized = normalizeUsers(json.users ?? []);
        memoryCache = normalized;
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
        setUsers(normalized);
        setIsReady(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load approval setups");
        setIsReady(true);
      }
    });
  }, [router, startRefresh]);

  useEffect(() => {
    if (memoryCache) return;
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as ApprovalUserRow[];
        memoryCache = parsed;
        setUsers(parsed);
        setIsReady(true);
      } catch {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  useEffect(() => {
    if (isReady || isForbidden) return;
    void refreshData();
  }, [isReady, isForbidden, refreshData]);

  const handleUsersChange = (nextUsers: ApprovalUserRow[]) => {
    memoryCache = nextUsers;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(nextUsers));
    setUsers(nextUsers);
  };

  const contentReady = isReady || users.length > 0;

  if (isForbidden) return <Forbidden />;

  return (
    <main className="min-h-screen bg-white p-8 text-slate-900">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <header>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Settings</p>
              <h1 className="mt-1 text-3xl font-semibold text-slate-900">Invoice approvals</h1>
            </div>
            {isRefreshing && <span className="text-xs text-slate-500">Refreshing…</span>}
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Define approver chains (limits + escalation) and substitutes. Today this applies to the invoice total; scope-based approvals can be layered on later.
          </p>
        </header>

        {error && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {error}{" "}
            <button type="button" onClick={refreshData} className="font-semibold underline">
              Retry
            </button>
          </div>
        )}

        {!contentReady ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Loading cached approvals…</div>
        ) : (
          <ApprovalsClient initialUsers={users} onUsersChange={handleUsersChange} />
        )}
      </div>
    </main>
  );
}
