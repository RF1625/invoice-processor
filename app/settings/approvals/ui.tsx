"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import type { ApprovalUserRow } from "@/lib/approvals-cache";

type DraftSetup = NonNullable<ApprovalUserRow["setup"]>;

const toDateInput = (raw: string | null | undefined) => {
  if (!raw) return "";
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const normalizeLimit = (value: string | null) => {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  return trimmed;
};

const setupOrDefault = (setup: ApprovalUserRow["setup"]): DraftSetup => ({
  approverUserId: setup?.approverUserId ?? null,
  approvalLimit: setup?.approvalLimit ?? null,
  substituteUserId: setup?.substituteUserId ?? null,
  substituteFrom: toDateInput(setup?.substituteFrom ?? null) || null,
  substituteTo: toDateInput(setup?.substituteTo ?? null) || null,
  active: setup?.active ?? true,
});

const sameSetup = (a: DraftSetup, b: DraftSetup) =>
  a.approverUserId === b.approverUserId &&
  normalizeLimit(a.approvalLimit) === normalizeLimit(b.approvalLimit) &&
  a.substituteUserId === b.substituteUserId &&
  (a.substituteFrom ?? "") === (b.substituteFrom ?? "") &&
  (a.substituteTo ?? "") === (b.substituteTo ?? "") &&
  a.active === b.active;

export function ApprovalsClient({
  initialUsers,
  onUsersChange,
}: {
  initialUsers: ApprovalUserRow[];
  onUsersChange?: (users: ApprovalUserRow[]) => void;
}) {
  const router = useRouter();
  const [users, setUsers] = useState<ApprovalUserRow[]>(initialUsers);
  const [draft, setDraft] = useState<Record<string, DraftSetup>>(() => {
    const map: Record<string, DraftSetup> = {};
    initialUsers.forEach((u) => {
      map[u.userId] = setupOrDefault(u.setup);
    });
    return map;
  });
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  const fieldClass =
    "!shadow-none !bg-white !text-slate-900 !border-slate-300 border focus:!ring-slate-200 focus:!ring-offset-0 hover:!bg-white placeholder:text-slate-500";

  useEffect(() => {
    setUsers(initialUsers);
    setDraft(() => {
      const map: Record<string, DraftSetup> = {};
      initialUsers.forEach((u) => {
        map[u.userId] = setupOrDefault(u.setup);
      });
      return map;
    });
  }, [initialUsers]);

  const options = useMemo(
    () =>
      users.map((u) => ({
        id: u.userId,
        label: `${u.name ?? u.email}${u.name ? ` (${u.email})` : ""}`,
      })),
    [users],
  );

  const updateDraft = (userId: string, partial: Partial<DraftSetup>) => {
    setDraft((prev) => ({ ...prev, [userId]: { ...prev[userId], ...partial } }));
  };

  const save = (userId: string) => {
    startSaving(async () => {
      setError(null);
      try {
        const current = draft[userId];
        const payload = {
          approverUserId: current.approverUserId ?? null,
          approvalLimit: normalizeLimit(current.approvalLimit),
          substituteUserId: current.substituteUserId ?? null,
          substituteFrom: current.substituteFrom ?? null,
          substituteTo: current.substituteTo ?? null,
          active: Boolean(current.active),
        };

        const res = await fetch(`/api/approval-setups/${userId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => ({}));
        if (res.status === 401) {
          router.push("/login?redirect=/settings/approvals");
          return;
        }
        if (!res.ok) throw new Error(json.error ?? "Failed to save approval setup");

        setUsers((prev) => {
          const nextUsers = prev.map((u) =>
            u.userId !== userId
              ? u
              : {
                  ...u,
                  setup: {
                    approverUserId: payload.approverUserId,
                    approvalLimit: payload.approvalLimit,
                    substituteUserId: payload.substituteUserId,
                    substituteFrom: payload.substituteFrom,
                    substituteTo: payload.substituteTo,
                    active: payload.active,
                  },
                },
          );
          onUsersChange?.(nextUsers);
          return nextUsers;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save approval setup");
      }
    });
  };

  return (
    <div className="grid gap-4">
      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </div>
      )}

      <section className="grid gap-4">
        {users.map((u) => {
          const current = draft[u.userId] ?? setupOrDefault(u.setup);
          const baseline = setupOrDefault(u.setup);
          const dirty = !sameSetup(current, baseline);

          const approverOptions = options.filter((opt) => opt.id !== u.userId);
          const substituteOptions = options.filter((opt) => opt.id !== u.userId);

          return (
            <div key={u.userId} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-base font-semibold text-slate-900">{u.name ?? u.email}</div>
                  <div className="mt-1 text-xs text-slate-600">
                    {u.email} · <span className="capitalize">{u.role}</span>
                  </div>
                </div>
                <Button type="button" onClick={() => save(u.userId)} disabled={!dirty || isSaving}>
                  {isSaving ? "Saving…" : dirty ? "Save changes" : "Saved"}
                </Button>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-12">
                <div className="md:col-span-5">
                  <Label className="text-xs font-semibold text-slate-600">Approver</Label>
                  <div className="mt-1">
                    <Select
                      value={current.approverUserId ?? "__none__"}
                      onValueChange={(v) => updateDraft(u.userId, { approverUserId: v === "__none__" ? null : v })}
                    >
                      <SelectTrigger className={fieldClass}>
                        <SelectValue placeholder="(none)" />
                      </SelectTrigger>
                      <SelectContent className="shadow-none">
                        <SelectItem value="__none__">(none)</SelectItem>
                        {approverOptions.map((opt) => (
                          <SelectItem key={opt.id} value={opt.id}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Invoices route from this user to their approver.</p>
                </div>

                <div className="md:col-span-2">
                  <Label className="text-xs font-semibold text-slate-600">Limit</Label>
                  <Input
                    inputMode="decimal"
                    value={current.approvalLimit ?? ""}
                    placeholder="Unlimited"
                    onChange={(e) => updateDraft(u.userId, { approvalLimit: e.target.value || null })}
                    className={`mt-1 ${fieldClass}`}
                  />
                  <p className="mt-1 text-xs text-slate-500">Blank means unlimited.</p>
                </div>

                <div className="md:col-span-5">
                  <Label className="text-xs font-semibold text-slate-600">Substitute approver</Label>
                  <div className="mt-1">
                    <Select
                      value={current.substituteUserId ?? "__none__"}
                      onValueChange={(v) => updateDraft(u.userId, { substituteUserId: v === "__none__" ? null : v })}
                    >
                      <SelectTrigger className={fieldClass}>
                        <SelectValue placeholder="(none)" />
                      </SelectTrigger>
                      <SelectContent className="shadow-none">
                        <SelectItem value="__none__">(none)</SelectItem>
                        {substituteOptions.map((opt) => (
                          <SelectItem key={opt.id} value={opt.id}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-semibold text-slate-600">From</Label>
                      <div className="mt-1">
                        <DatePicker
                          value={current.substituteFrom}
                          onChange={(next) => updateDraft(u.userId, { substituteFrom: next })}
                          placeholder="Select date"
                          className={fieldClass}
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-slate-600">To</Label>
                      <div className="mt-1">
                        <DatePicker
                          value={current.substituteTo}
                          onChange={(next) => updateDraft(u.userId, { substituteTo: next })}
                          placeholder="Select date"
                          className={fieldClass}
                        />
                      </div>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Substitutes can approve during this window.</p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                  <Checkbox checked={current.active} onCheckedChange={(v) => updateDraft(u.userId, { active: Boolean(v) })} />
                  Active for approvals
                </label>
                <div className="text-xs text-slate-600">{dirty ? "Unsaved changes" : "Up to date"}</div>
              </div>
            </div>
          );
        })}

        {users.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">No firm users found.</div>
        )}
      </section>
    </div>
  );
}
