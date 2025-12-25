"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchAndCache, readCache } from "@/lib/client-cache";
import { fetchMailboxes } from "@/lib/nav-prefetch";

const DEFAULT_MAX_MESSAGES = 10;
const DEFAULT_SUBJECT_KEYWORDS = ["invoice", "bill", "payment", "statement"];
const CACHE_KEY = "inbox-mailboxes-v1";
const CACHE_TTL_MS = 60_000;

type MailboxRow = {
  id: string;
  provider: string;
  imapHost?: string | null;
  imapPort?: number | null;
  imapTls?: boolean | null;
  imapUser?: string | null;
  allowedSenders?: string | null;
  subjectKeywords?: string | null;
  sourceMailbox?: string | null;
  processedMailbox?: string | null;
  maxMessages?: number | null;
  active: boolean;
  lastRunAt?: string | null;
  lastSeenUid?: number | null;
  hasSecret?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
};

const defaultKeywords = DEFAULT_SUBJECT_KEYWORDS.join(",");

type MailboxSummary = {
  mailboxId: string;
  potentialCount: number;
  sinceDays: number;
  latestUid: number | null;
  previews: Array<{ uid: number; subject: string; from: string[]; hasPdf: boolean }>;
};

export default function ConnectInboxPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-600">Loading inbox settings...</div>}>
      <InboxContent />
    </Suspense>
  );
}

function InboxContent() {
  const searchParams = useSearchParams();
  const [mailboxes, setMailboxes] = useState<MailboxRow[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [ingestingId, setIngestingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<MailboxSummary | null>(null);
  const [summaryMailboxId, setSummaryMailboxId] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryAction, setSummaryAction] = useState<string | null>(null);
  const shouldRefresh = useMemo(
    () => lastUpdated == null || Date.now() - lastUpdated > CACHE_TTL_MS,
    [lastUpdated],
  );

  const [form, setForm] = useState({
    host: "",
    port: "993",
    tls: true,
    user: "",
    password: "",
    allowedSenders: "",
    subjectKeywords: defaultKeywords,
    sourceMailbox: "INBOX",
    processedMailbox: "",
    maxMessages: DEFAULT_MAX_MESSAGES.toString(),
  });

  useEffect(() => {
    const connected = searchParams.get("connected");
    const oauthError = searchParams.get("error");
    const provider = searchParams.get("provider") ?? connected ?? "";
    if (connected) {
      setMessage(`${capitalize(provider)} inbox connected`);
    }
    if (oauthError) {
      setError(`OAuth failed: ${oauthError}`);
    }
  }, [searchParams]);

  useEffect(() => {
    const connected = searchParams.get("connected");
    if (connected && mailboxes.length) {
      const newest = pickNewestMailbox(mailboxes);
      if (newest) {
        void fetchSummary(newest.id);
      }
    }
  }, [mailboxes, searchParams]);

  useEffect(() => {
    const cachedEntry = readCache<MailboxRow[]>(CACHE_KEY);
    if (cachedEntry) {
      setMailboxes(cachedEntry.data);
      setLastUpdated(cachedEntry.updatedAt);
    }
    setIsReady(true);
  }, []);

  const loadMailboxes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const entry = await fetchAndCache<MailboxRow[]>(CACHE_KEY, fetchMailboxes);
      setMailboxes(entry.data);
      setIsReady(true);
      setLastUpdated(entry.updatedAt);
    } catch (err) {
      if (err instanceof Error && err.message.includes("Unauthorized")) {
        setError("Please sign in again.");
        setIsReady(true);
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load mailboxes");
      setIsReady(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const pickNewestMailbox = (list: MailboxRow[]) => {
    if (!list.length) return null;
    const sorted = [...list].sort((a, b) => {
      const aDate = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
      const bDate = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
      return bDate - aDate;
    });
    return sorted[0];
  };

  const fetchSummary = async (mailboxId: string, sinceDays = 30) => {
    setSummaryMailboxId(mailboxId);
    setSummaryLoading(true);
    setSummaryError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/mailboxes/${mailboxId}/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sinceDays }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Failed to summarize inbox");
      setSummary(json as MailboxSummary);
    } catch (err) {
      setSummary(null);
      setSummaryError(err instanceof Error ? err.message : "Failed to summarize inbox");
    } finally {
      setSummaryLoading(false);
    }
  };

  useEffect(() => {
    if (!isReady) return;
    if (!shouldRefresh) return;
    loadMailboxes().catch(() => {});
  }, [isReady, shouldRefresh, loadMailboxes]);

  const handleOAuth = (provider: "google" | "outlook") => {
    setMessage(null);
    setError(null);
    window.location.href = `/api/mailboxes/oauth/${provider}/start`;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const payload = {
        provider: "imap",
        imapHost: form.host,
        imapPort: form.port ? Number(form.port) : null,
        imapTls: form.tls,
        imapUser: form.user,
        secret: form.password,
        allowedSenders: form.allowedSenders || null,
        subjectKeywords: form.subjectKeywords || null,
        sourceMailbox: form.sourceMailbox || "INBOX",
        processedMailbox: form.processedMailbox || null,
        maxMessages: form.maxMessages ? Number(form.maxMessages) : null,
      };
      const res = await fetch("/api/mailboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save mailbox");
      setMessage("Custom IMAP inbox saved. Test it below.");
      setForm((prev) => ({ ...prev, password: "" }));
      await loadMailboxes();
      if (json.mailbox?.id) {
        setSummary(null);
        void fetchSummary(json.mailbox.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save mailbox");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/mailboxes/${id}/test`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "Mailbox test failed");
      }
      const attachmentCount = json.previews?.[0]?.pdfAttachments?.length ?? 0;
      setMessage(`Test succeeded - first unseen message has ${attachmentCount} PDF attachment(s)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mailbox test failed");
    } finally {
      setTestingId(null);
    }
  };

  const handleIngest = async (id: string) => {
    setIngestingId(id);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/mailboxes/${id}/ingest`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error ?? "Ingest failed");
      }
      setMessage(
        `Ingest complete - processed ${json.processedCount ?? json.processed?.length ?? 0} attachment(s)`,
      );
      await loadMailboxes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ingest failed");
    } finally {
      setIngestingId(null);
    }
  };

  const handleSummaryAction = async (action: "new" | "backfill30" | "backfill90" | "samples") => {
    if (!summaryMailboxId) return;
    setSummaryAction(action);
    setMessage(null);
    setError(null);
    try {
      if (action === "new") {
        const res = await fetch(`/api/mailboxes/${summaryMailboxId}/checkpoint`, { method: "POST" });
        const json = await res.json();
        if (!res.ok || json.error) throw new Error(json.error ?? "Failed to set checkpoint");
        setMessage("Checkpoint set. Future ingests will only take new mail from now.");
      } else if (action === "backfill30") {
        const res = await fetch(`/api/mailboxes/${summaryMailboxId}/ingest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sinceDays: 30 }),
        });
        const json = await res.json();
        if (!res.ok || json.error) throw new Error(json.error ?? "Backfill failed");
        setMessage(`Backfill complete - processed ${json.processedCount ?? json.processed?.length ?? 0} attachment(s)`);
      } else if (action === "backfill90") {
        const res = await fetch(`/api/mailboxes/${summaryMailboxId}/ingest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sinceDays: 90 }),
        });
        const json = await res.json();
        if (!res.ok || json.error) throw new Error(json.error ?? "Backfill failed");
        setMessage(`Backfill complete - processed ${json.processedCount ?? json.processed?.length ?? 0} attachment(s)`);
      } else if (action === "samples") {
        const res = await fetch(`/api/mailboxes/${summaryMailboxId}/ingest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sinceDays: 90, maxMessages: 5 }),
        });
        const json = await res.json();
        if (!res.ok || json.error) throw new Error(json.error ?? "Sample import failed");
        setMessage(`Sample import complete - processed ${json.processedCount ?? json.processed?.length ?? 0} attachment(s)`);
      }
      await loadMailboxes();
      if (summaryMailboxId) {
        void fetchSummary(summaryMailboxId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setSummaryAction(null);
    }
  };

  const sortedMailboxes = useMemo(
    () =>
      [...mailboxes].sort((a, b) => (b.lastRunAt ?? "").localeCompare(a.lastRunAt ?? "")),
    [mailboxes],
  );

  return (
    <main className="min-h-screen bg-white p-8 text-slate-900">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-wide text-slate-500">Settings</p>
            <h1 className="text-3xl font-semibold">Connect inbox</h1>
            <p className="text-sm text-slate-600">
              Link an email inbox so invoices are pulled automatically.
            </p>
          </div>
          <Link
            href="/"
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Back to app
          </Link>
        </header>

        {(message || error) && (
          <div
            className={`rounded-xl border px-4 py-3 text-sm shadow-sm ${
              error
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            {error ?? message}
          </div>
        )}

        {summaryLoading && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
            Checking the inbox and counting likely invoices…
          </div>
        )}
        {summaryError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-sm">
            {summaryError}
          </div>
        )}
        {summary && (
          <section className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-slate-100">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-slate-500">Inbox ready</p>
                <h2 className="text-xl font-semibold text-slate-900">
                  We found {summary.potentialCount} potential invoices in the last {summary.sinceDays} days.
                </h2>
                <p className="text-sm text-slate-600">
                  Set up vendors, G/Ls, and rules first under{" "}
                  <Link className="font-semibold text-slate-900 underline-offset-4 hover:underline" href="/database">
                    Database
                  </Link>{" "}
                  for clean coding before you import.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => summaryMailboxId && fetchSummary(summaryMailboxId)}
                >
                  Re-check
                </Button>
              </div>
            </div>

            {summary.previews.length > 0 && (
              <div className="mt-4 space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-800">
                <div className="text-xs font-semibold uppercase text-slate-600">Recent matches</div>
                {summary.previews.map((p) => (
                  <div key={p.uid} className="flex flex-col gap-1 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-100">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      <span className="rounded-full bg-emerald-50 px-2 py-1 font-semibold text-emerald-700 ring-1 ring-emerald-100">
                        UID {p.uid}
                      </span>
                      {p.hasPdf ? (
                        <span className="rounded-full bg-slate-900 px-2 py-1 font-semibold text-white">PDF attached</span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-700">No PDF</span>
                      )}
                    </div>
                    <div className="text-sm font-semibold text-slate-900">{p.subject || "(no subject)"}</div>
                    <div className="text-xs text-slate-600">From: {p.from.join(", ") || "Unknown"}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleSummaryAction("new")}
                disabled={summaryAction !== null}
                className="h-auto w-full justify-between border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-100"
              >
                <span>Only new from now</span>
                <span className="text-xs font-medium text-slate-600">Set checkpoint</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleSummaryAction("samples")}
                disabled={summaryAction !== null}
                className="h-auto w-full justify-between border-emerald-200 bg-emerald-50 px-4 py-3 text-left text-sm font-semibold text-emerald-800 shadow-sm hover:bg-emerald-100"
              >
                <span>Import 5 samples</span>
                <span className="text-xs font-medium text-emerald-700">Quick dry-run</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleSummaryAction("backfill30")}
                disabled={summaryAction !== null}
                className="h-auto w-full justify-between border-slate-200 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
              >
                <span>Backfill 30 days</span>
                <span className="text-xs font-medium text-slate-600">One-time import</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleSummaryAction("backfill90")}
                disabled={summaryAction !== null}
                className="h-auto w-full justify-between border-slate-200 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
              >
                <span>Backfill 90 days</span>
                <span className="text-xs font-medium text-slate-600">Larger one-time import</span>
              </Button>
            </div>
          </section>
        )}


        <section className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Connect with OAuth</h2>
              <p className="mt-1 text-sm text-slate-600">
                We use OAuth to get an IMAP refresh token - no passwords stored. Works best for Google Workspace and Microsoft 365.
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Button type="button" onClick={() => handleOAuth("google")} className="w-full gap-2 sm:w-auto">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Connect Google
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOAuth("outlook")}
              className="w-full gap-2 sm:w-auto"
            >
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              Connect Outlook
            </Button>
          </div>
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-slate-600">
            <li>We request IMAP + email scopes only.</li>
            <li>Inbox is limited by sender/subject filters you can adjust later.</li>
            <li>After approving, you&apos;ll land back here with the inbox listed below.</li>
          </ul>
        </section>

        <section className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-slate-100">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Connected inboxes</h2>
              <p className="text-sm text-slate-600">Run a test or ingest now.</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => loadMailboxes()}>
              Refresh
            </Button>
          </div>

          <div className="mt-4 space-y-3">
            {loading && !isReady && <p className="text-sm text-slate-600">Loading mailboxes...</p>}
            {!loading && sortedMailboxes.length === 0 && (
              <p className="text-sm text-slate-600">No inboxes connected yet.</p>
            )}
            {sortedMailboxes.map((mailbox) => (
              <div
                key={mailbox.id}
                className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <span className="rounded-full bg-white px-2 py-1 text-xs font-medium uppercase text-slate-700">
                      {mailbox.provider}
                    </span>
                    <span>{mailbox.imapUser ?? "(no username)"}</span>
                    {!mailbox.active && (
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
                        inactive
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600">
                    Host: {mailbox.imapHost ?? "-"} | Mailbox: {mailbox.sourceMailbox ?? "INBOX"} | Max:{" "}
                    {mailbox.maxMessages ?? DEFAULT_MAX_MESSAGES}
                  </p>
                  <p className="text-xs text-slate-500">
                    Last run: {mailbox.lastRunAt ? new Date(mailbox.lastRunAt).toLocaleString() : "never"} | Last seen UID:{" "}
                    {mailbox.lastSeenUid ?? "-"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleTest(mailbox.id)}
                    disabled={testingId === mailbox.id}
                  >
                    {testingId === mailbox.id ? "Testing..." : "Test connection"}
                  </Button>
                  <Button type="button" onClick={() => handleIngest(mailbox.id)} disabled={ingestingId === mailbox.id}>
                    {ingestingId === mailbox.id ? "Ingesting..." : "Run ingest now"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function LabeledInput({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <div className="flex flex-col gap-1 text-sm font-medium text-slate-700">
      <Label>{label}</Label>
      <Input {...props} />
    </div>
  );
}

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
