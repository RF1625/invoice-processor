"use client";

import { fetchAndCache, isStale, readCache } from "@/lib/client-cache";
import { normalizeDatabaseSnapshot, type DatabaseSnapshot } from "@/lib/database-cache";
import { normalizeApprovalUsers, type ApprovalSettingsCache } from "@/lib/approvals-cache";

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

const fetchDashboardRuns = async () => {
  const res = await fetch("/api/invoice-runs", { cache: "no-store" });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Failed to load activity");
  return json.runs ?? [];
};

const fetchApprovalsInbox = async () => {
  const res = await fetch("/api/approvals/inbox", { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) throw new Error(json.error ?? "Failed to load approvals");
  return json.items ?? [];
};

const fetchMailboxes = async () => {
  const res = await fetch("/api/mailboxes", { cache: "no-store" });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Failed to load mailboxes");
  return json.mailboxes ?? [];
};

const fetchApprovalSettings = async (): Promise<ApprovalSettingsCache> => {
  const res = await fetch("/api/approval-setups", { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error("Unauthorized");
  if (res.status === 403) return { users: [], forbidden: true };
  if (!res.ok) throw new Error(json.error ?? "Failed to load approval setups");
  return { users: normalizeApprovalUsers(json.users ?? []), forbidden: false };
};

const fetchDatabaseSnapshot = async (): Promise<DatabaseSnapshot> => {
  const [vendorsRes, glRes, dimRes, ruleRes, runRes, invoiceRes] = await Promise.all([
    fetch("/api/vendors", { cache: "no-store" }),
    fetch("/api/gl-accounts", { cache: "no-store" }),
    fetch("/api/dimensions", { cache: "no-store" }),
    fetch("/api/vendor-rules", { cache: "no-store" }),
    fetch("/api/invoice-runs", { cache: "no-store" }),
    fetch("/api/invoices?take=10", { cache: "no-store" }),
  ]);

  if (vendorsRes.status === 401 || glRes.status === 401 || dimRes.status === 401 || ruleRes.status === 401 || runRes.status === 401 || invoiceRes.status === 401) {
    throw new Error("Unauthorized");
  }

  const [vendorsJson, glJson, dimJson, ruleJson, runJson, invoiceJson] = await Promise.all([
    vendorsRes.json(),
    glRes.json(),
    dimRes.json(),
    ruleRes.json(),
    runRes.json(),
    invoiceRes.json(),
  ]);

  if (!vendorsRes.ok) throw new Error(vendorsJson.error ?? "Failed to load vendors");
  if (!glRes.ok) throw new Error(glJson.error ?? "Failed to load GL accounts");
  if (!dimRes.ok) throw new Error(dimJson.error ?? "Failed to load dimensions");
  if (!ruleRes.ok) throw new Error(ruleJson.error ?? "Failed to load rules");
  if (!runRes.ok) throw new Error(runJson.error ?? "Failed to load runs");
  if (!invoiceRes.ok) throw new Error(invoiceJson.error ?? "Failed to load invoices");

  return normalizeDatabaseSnapshot({
    vendorsJson,
    glJson,
    dimJson,
    ruleJson,
    runJson,
    invoiceJson,
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
