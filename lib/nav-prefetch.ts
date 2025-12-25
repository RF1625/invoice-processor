"use client";

import { fetchAndCache, isStale, readCache } from "@/lib/client-cache";
import { normalizeDatabaseSnapshot, type DatabaseSnapshot } from "@/lib/database-cache";
import { normalizeApprovalUsers, type ApprovalSettingsCache, type ApprovalInboxItem } from "@/lib/approvals-cache";
import { readJson } from "@/lib/http";

const DASHBOARD_KEY = "dashboard-runs-v1";
const APPROVALS_KEY = "approvals-inbox-v1";
const INBOX_KEY = "inbox-mailboxes-v1";
const DATABASE_KEY = "db-cache-v1";
const APPROVAL_SETTINGS_KEY = "approvals-cache-v1";

const DASHBOARD_TTL_MS = 30_000;
const APPROVALS_TTL_MS = 30_000;
const INBOX_TTL_MS = 60_000;
const DATABASE_TTL_MS = 120_000;
const APPROVAL_SETTINGS_TTL_MS = 60_000;

const shouldPrefetch = (key: string, maxAgeMs: number) => isStale(readCache(key), maxAgeMs);

export const fetchDashboardRuns = async () => {
  const res = await fetch("/api/invoice-runs", { cache: "no-store" });
  const json = await readJson<{ runs?: unknown[]; error?: string }>(res);
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) throw new Error(json.error ?? "Failed to load activity");
  return json.runs ?? [];
};

export const fetchApprovalsInbox = async (): Promise<ApprovalInboxItem[]> => {
  const res = await fetch("/api/approvals/inbox", { cache: "no-store" });
  const json = await readJson<{ items?: ApprovalInboxItem[]; error?: string }>(res);
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) throw new Error(json.error ?? "Failed to load approvals");
  return json.items ?? [];
};

export const fetchMailboxes = async () => {
  const res = await fetch("/api/mailboxes", { cache: "no-store" });
  const json = await readJson<{ mailboxes?: unknown[]; error?: string }>(res);
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) throw new Error(json.error ?? "Failed to load mailboxes");
  return json.mailboxes ?? [];
};

export const fetchApprovalSettings = async (): Promise<ApprovalSettingsCache> => {
  const res = await fetch("/api/approval-setups", { cache: "no-store" });
  const json = await readJson<{ users?: unknown[]; error?: string }>(res);
  if (res.status === 401) throw new Error("Unauthorized");
  if (res.status === 403) return { users: [], forbidden: true };
  if (!res.ok) throw new Error(json.error ?? "Failed to load approval setups");
  return { users: normalizeApprovalUsers(json.users ?? []), forbidden: false };
};

export const fetchDatabaseSnapshot = async (): Promise<DatabaseSnapshot> => {
  const res = await fetch("/api/database-snapshot", { cache: "no-store" });
  const json = await readJson<{
    vendors?: unknown[];
    glAccounts?: unknown[];
    dimensions?: unknown[];
    rules?: unknown[];
    runs?: unknown[];
    invoices?: unknown[];
    error?: string;
  }>(res);
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) throw new Error(json.error ?? "Failed to load database snapshot");
  return normalizeDatabaseSnapshot({
    vendorsJson: { vendors: json.vendors ?? [] },
    glJson: { glAccounts: json.glAccounts ?? [] },
    dimJson: { dimensions: json.dimensions ?? [] },
    ruleJson: { rules: json.rules ?? [] },
    runJson: { runs: json.runs ?? [] },
    invoiceJson: { invoices: json.invoices ?? [] },
  });
};

const safePrefetch = async <T>(key: string, maxAgeMs: number, fetcher: () => Promise<T>) => {
  if (!shouldPrefetch(key, maxAgeMs)) return;
  try {
    await fetchAndCache(key, fetcher);
  } catch {
    // Ignore background prefetch failures.
  }
};

export const prefetchNavData = () => {
  void safePrefetch(DASHBOARD_KEY, DASHBOARD_TTL_MS, fetchDashboardRuns);
  void safePrefetch(APPROVALS_KEY, APPROVALS_TTL_MS, fetchApprovalsInbox);
  void safePrefetch(INBOX_KEY, INBOX_TTL_MS, fetchMailboxes);
  void safePrefetch(DATABASE_KEY, DATABASE_TTL_MS, fetchDatabaseSnapshot);
  void safePrefetch(APPROVAL_SETTINGS_KEY, APPROVAL_SETTINGS_TTL_MS, fetchApprovalSettings);
};

export const prefetchNavDataForHref = (href: string) => {
  if (href === "/dashboard" || href.startsWith("/dashboard/")) {
    void safePrefetch(DASHBOARD_KEY, DASHBOARD_TTL_MS, fetchDashboardRuns);
    return;
  }
  if (href === "/approvals" || href.startsWith("/approvals/")) {
    void safePrefetch(APPROVALS_KEY, APPROVALS_TTL_MS, fetchApprovalsInbox);
    return;
  }
  if (href === "/database" || href.startsWith("/database/")) {
    void safePrefetch(DATABASE_KEY, DATABASE_TTL_MS, fetchDatabaseSnapshot);
    return;
  }
  if (href === "/settings/inbox" || href.startsWith("/settings/inbox/")) {
    void safePrefetch(INBOX_KEY, INBOX_TTL_MS, fetchMailboxes);
    return;
  }
  if (href === "/settings/approvals" || href.startsWith("/settings/approvals/")) {
    void safePrefetch(APPROVAL_SETTINGS_KEY, APPROVAL_SETTINGS_TTL_MS, fetchApprovalSettings);
  }
};
