"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ApprovalsClient } from "./ui";
import { Button } from "@/components/ui/button";
import { type ApprovalSettingsCache, type ApprovalUserRow } from "@/lib/approvals-cache";
import { fetchAndCache, readCache, writeCache } from "@/lib/client-cache";
import { fetchApprovalSettings } from "@/lib/nav-prefetch";

const CACHE_KEY = "approvals-cache-v1";
const CACHE_TTL_MS = 60_000;

const coerceCache = (value: ApprovalSettingsCache | ApprovalUserRow[]): ApprovalSettingsCache => {
  if (Array.isArray(value)) return { users: value, forbidden: false };
  return { users: value.users ?? [], forbidden: Boolean(value.forbidden) };
};

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
  const [users, setUsers] = useState<ApprovalUserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isForbidden, setIsForbidden] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [isRefreshing, startRefresh] = useTransition();
  const shouldRefresh = useMemo(
    () => lastUpdated == null || Date.now() - lastUpdated > CACHE_TTL_MS,
    [lastUpdated],
  );

  const refreshData = useCallback(() => {
    startRefresh(async () => {
      try {
        setError(null);
        const entry = await fetchAndCache<ApprovalSettingsCache>(CACHE_KEY, fetchApprovalSettings);
        if (entry.data.forbidden) {
          setIsForbidden(true);
          setIsReady(true);
          setLastUpdated(entry.updatedAt);
          return;
        }
        setUsers(entry.data.users);
        setIsForbidden(false);
        setIsReady(true);
        setLastUpdated(entry.updatedAt);
      } catch (err) {
        if (err instanceof Error && err.message.includes("Unauthorized")) {
          router.push("/login?redirect=/settings/approvals");
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load approval setups");
        setIsReady(true);
      }
    });
  }, [router, startRefresh]);

  useEffect(() => {
    const cachedEntry = readCache<ApprovalSettingsCache | ApprovalUserRow[]>(CACHE_KEY);
    if (cachedEntry) {
      const cached = coerceCache(cachedEntry.data);
      setUsers(cached.users);
      setIsForbidden(cached.forbidden);
      setLastUpdated(cachedEntry.updatedAt);
    }
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!isReady) return;
    if (isForbidden) return;
    if (isReady && !shouldRefresh) return;
    void refreshData();
  }, [isReady, isForbidden, shouldRefresh, refreshData]);

  const handleUsersChange = (nextUsers: ApprovalUserRow[]) => {
    const entry = writeCache<ApprovalSettingsCache>(CACHE_KEY, { users: nextUsers, forbidden: false });
    setUsers(entry.data.users);
    setIsForbidden(false);
    setLastUpdated(entry.updatedAt);
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
            <Button type="button" variant="link" className="h-auto p-0 font-semibold" onClick={refreshData}>
              Retry
            </Button>
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
