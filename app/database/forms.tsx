"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MatchType } from "@prisma/client";

type VendorInput = {
  id: string;
  vendorNo: string;
  name: string;
  gstNumber?: string | null;
  defaultCurrency?: string | null;
  defaultDimensions?: Record<string, string> | null;
  active: boolean;
};

type RuleInput = {
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

type GlAccountInput = { id: string; no: string; name: string; type?: string | null };
type DimensionInput = { id: string; code: string; valueCode: string; valueName: string; active: boolean };
type InvoiceApprovalInput = { id: string; status: string; comment?: string | null; actedAt?: string | null; createdAt: string };
type InvoiceInput = {
  id: string;
  invoiceNo?: string | null;
  vendorName?: string | null;
  status: string;
  currencyCode?: string | null;
  totalAmount: number;
  approvals: InvoiceApprovalInput[];
};

const formatDims = (value: Record<string, string> | null | undefined) =>
  value && Object.keys(value).length > 0 ? JSON.stringify(value) : "—";

const parseJsonInput = (input: string) => {
  if (!input.trim()) return {};
  const parsed = JSON.parse(input);
  if (parsed && typeof parsed === "object") return parsed;
  throw new Error("Dimensions must be a JSON object");
};

const statusBadge = (status: string) => {
  const base = "rounded-full px-2 py-1 text-xs font-semibold ring-1";
  switch (status) {
    case "approved":
      return <span className={`${base} bg-green-50 text-green-700 ring-green-200`}>Approved</span>;
    case "rejected":
      return <span className={`${base} bg-red-50 text-red-700 ring-red-200`}>Rejected</span>;
    case "pending_approval":
    case "pending":
      return <span className={`${base} bg-amber-50 text-amber-700 ring-amber-200`}>Pending</span>;
    default:
      return <span className={`${base} bg-slate-100 text-slate-700 ring-slate-200`}>{status}</span>;
  }
};

export function VendorManager({ vendors }: { vendors: VendorInput[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [vendorNo, setVendorNo] = useState("");
  const [name, setName] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [defaultCurrency, setDefaultCurrency] = useState("");
  const [defaultDimensions, setDefaultDimensions] = useState("");
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setEditingId(null);
    setVendorNo("");
    setName("");
    setGstNumber("");
    setDefaultCurrency("");
    setDefaultDimensions("");
    setActive(true);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const dims = parseJsonInput(defaultDimensions || "{}");
      const payload = {
        vendorNo,
        name,
        gstNumber: gstNumber || null,
        defaultCurrency: defaultCurrency || null,
        defaultDimensions: dims,
        active,
      };
      const res = await fetch(editingId ? `/api/vendors/${editingId}` : "/api/vendors", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to save vendor");
      resetForm();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save vendor");
    }
  };

  const handleEdit = (vendor: VendorInput) => {
    setEditingId(vendor.id);
    setVendorNo(vendor.vendorNo);
    setName(vendor.name);
    setGstNumber(vendor.gstNumber ?? "");
    setDefaultCurrency(vendor.defaultCurrency ?? "");
    setDefaultDimensions(vendor.defaultDimensions ? JSON.stringify(vendor.defaultDimensions) : "");
    setActive(vendor.active);
    setError(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this vendor? This will also remove its rules.")) return;
    try {
      const res = await fetch(`/api/vendors/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete vendor");
      if (editingId === id) resetForm();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete vendor");
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="grid grid-cols-6 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase text-slate-600">
          <span>Vendor #</span>
          <span className="col-span-2">Name</span>
          <span>GST</span>
          <span>Currency</span>
          <span className="text-right">Active</span>
        </div>
        <ul className="divide-y divide-slate-100 text-sm">
          {vendors.map((v) => (
            <li key={v.id} className="grid grid-cols-6 items-center px-3 py-3">
              <div className="font-mono text-slate-800">{v.vendorNo}</div>
              <div className="col-span-2">
                <div className="font-semibold text-slate-900">{v.name}</div>
                <div className="text-xs text-slate-600">Default dims: {formatDims(v.defaultDimensions ?? {})}</div>
              </div>
              <div className="text-slate-700">{v.gstNumber ?? "—"}</div>
              <div className="text-slate-700">{v.defaultCurrency ?? "—"}</div>
              <div className="text-right text-slate-700">
                {v.active ? (
                  <span className="rounded-full bg-green-50 px-2 py-1 text-xs font-semibold text-green-700 ring-1 ring-green-200">
                    Active
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                    Inactive
                  </span>
                )}
              </div>
              <div className="col-span-6 mt-2 flex gap-2 text-xs">
                <button className="text-slate-700 underline underline-offset-4" onClick={() => handleEdit(v)}>
                  Edit
                </button>
                <button className="text-red-600 underline underline-offset-4" onClick={() => handleDelete(v.id)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
          {vendors.length === 0 && <li className="px-3 py-3 text-slate-600">No vendors yet.</li>}
        </ul>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">{editingId ? "Edit vendor" : "Add vendor"}</div>
            <p className="text-xs text-slate-600">Maintain vendor master data stored in Supabase</p>
          </div>
          {editingId && (
            <button type="button" className="text-xs text-slate-600 underline underline-offset-4" onClick={resetForm}>
              Cancel edit
            </button>
          )}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-600">Vendor #</label>
          <input
            required
            value={vendorNo}
            onChange={(e) => setVendorNo(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-600">Name</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">GST number</label>
            <input
              value={gstNumber}
              onChange={(e) => setGstNumber(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Default currency</label>
            <input
              value={defaultCurrency}
              onChange={(e) => setDefaultCurrency(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-600">Default dimensions (JSON)</label>
          <textarea
            value={defaultDimensions}
            onChange={(e) => setDefaultDimensions(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            rows={3}
            placeholder='{"DEPARTMENT":"OPS"}'
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Active
        </label>
        <button
          type="submit"
          className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          {editingId ? "Update vendor" : "Add vendor"}
        </button>
      </form>
    </div>
  );
}

export function InvoiceApprovalPanel({ invoices }: { invoices: InvoiceInput[] }) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setApproval = async (invoiceId: string, status: "pending" | "approved" | "rejected", comment?: string | null) => {
    setLoadingId(invoiceId);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/approvals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, comment: comment ?? null }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to update approval");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update approval");
    } finally {
      setLoadingId(null);
    }
  };

  const handleReject = (invoiceId: string) => {
    const comment = window.prompt("Add a rejection note (optional):") ?? null;
    void setApproval(invoiceId, "rejected", comment);
  };

  const handleApprove = (invoiceId: string) => {
    const comment = window.prompt("Add an approval note (optional):") ?? null;
    void setApproval(invoiceId, "approved", comment);
  };

  const handleRequest = (invoiceId: string) => {
    void setApproval(invoiceId, "pending", null);
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Invoices & approvals</h2>
          <p className="text-xs text-slate-600">Track approval state and history per invoice</p>
        </div>
        {error && <div className="text-xs text-red-600">{error}</div>}
      </div>
      <div className="mt-3 overflow-hidden rounded-lg border border-slate-100">
        <div className="grid grid-cols-6 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase text-slate-600">
          <span>Invoice #</span>
          <span>Vendor</span>
          <span>Status</span>
          <span className="text-right">Total</span>
          <span>Last approval</span>
          <span className="text-right">Actions</span>
        </div>
        <ul className="divide-y divide-slate-100 text-sm">
          {invoices.map((inv) => {
            const lastApproval = inv.approvals[0];
            return (
              <li key={inv.id} className="grid grid-cols-6 items-center px-3 py-3">
                <div className="font-mono text-slate-800">{inv.invoiceNo ?? "—"}</div>
                <div className="text-slate-800">{inv.vendorName ?? "—"}</div>
                <div className="flex items-center gap-2">{statusBadge(inv.status)}</div>
                <div className="text-right font-semibold text-slate-900">
                  {inv.currencyCode ?? ""} {inv.totalAmount.toFixed(2)}
                </div>
                <div className="text-xs text-slate-600">
                  {lastApproval ? (
                    <>
                      {statusBadge(lastApproval.status)}{" "}
                      {lastApproval.actedAt
                        ? new Date(lastApproval.actedAt).toLocaleString()
                        : new Date(lastApproval.createdAt).toLocaleString()}
                      {lastApproval.comment ? ` — ${lastApproval.comment}` : ""}
                    </>
                  ) : (
                    "No approvals yet"
                  )}
                </div>
                <div className="flex justify-end gap-2 text-xs">
                  <button
                    className="rounded-md border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    onClick={() => handleRequest(inv.id)}
                    disabled={loadingId === inv.id}
                  >
                    Request
                  </button>
                  <button
                    className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1 font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                    onClick={() => handleApprove(inv.id)}
                    disabled={loadingId === inv.id || inv.status === "approved"}
                  >
                    Approve
                  </button>
                  <button
                    className="rounded-md border border-red-200 bg-red-50 px-3 py-1 font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                    onClick={() => handleReject(inv.id)}
                    disabled={loadingId === inv.id || inv.status === "rejected"}
                  >
                    Reject
                  </button>
                </div>
                {inv.approvals.length > 0 && (
                  <div className="col-span-6 mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <div className="font-semibold text-slate-700">History</div>
                    <ul className="mt-1 space-y-1">
                      {inv.approvals.map((a) => (
                        <li key={a.id} className="flex items-center gap-2">
                          {statusBadge(a.status)}
                          <span>{new Date(a.actedAt ?? a.createdAt).toLocaleString()}</span>
                          {a.comment && <span className="text-slate-500">— {a.comment}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
          {invoices.length === 0 && <li className="px-3 py-3 text-slate-600">No invoices yet.</li>}
        </ul>
      </div>
    </section>
  );
}

export function GlAccountManager({ glAccounts }: { glAccounts: GlAccountInput[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [no, setNo] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setEditingId(null);
    setNo("");
    setName("");
    setType("");
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { no, name, type: type || null };
      const res = await fetch(editingId ? `/api/gl-accounts/${editingId}` : "/api/gl-accounts", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to save G/L account");
      resetForm();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save G/L account");
    }
  };

  const handleEdit = (glAccount: GlAccountInput) => {
    setEditingId(glAccount.id);
    setNo(glAccount.no);
    setName(glAccount.name);
    setType(glAccount.type ?? "");
    setError(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this G/L account?")) return;
    try {
      const res = await fetch(`/api/gl-accounts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete G/L account");
      if (editingId === id) resetForm();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete G/L account");
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="grid grid-cols-3 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase text-slate-600">
          <span>No</span>
          <span>Name</span>
          <span className="text-right">Type</span>
        </div>
        <ul className="divide-y divide-slate-100 text-sm">
          {glAccounts.map((g) => (
            <li key={g.id} className="grid grid-cols-3 items-center px-3 py-3">
              <div className="font-mono text-slate-800">{g.no}</div>
              <div className="text-slate-800">{g.name}</div>
              <div className="text-right text-slate-700">{g.type ?? "—"}</div>
              <div className="col-span-3 mt-2 flex gap-2 text-xs">
                <button className="text-slate-700 underline underline-offset-4" onClick={() => handleEdit(g)}>
                  Edit
                </button>
                <button className="text-red-600 underline underline-offset-4" onClick={() => handleDelete(g.id)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
          {glAccounts.length === 0 && <li className="px-3 py-3 text-slate-600">No G/L accounts yet.</li>}
        </ul>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">{editingId ? "Edit G/L account" : "Add G/L account"}</div>
            <p className="text-xs text-slate-600">Manage chart of accounts without NAV</p>
          </div>
          {editingId && (
            <button type="button" className="text-xs text-slate-600 underline underline-offset-4" onClick={resetForm}>
              Cancel edit
            </button>
          )}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-600">G/L number</label>
          <input
            required
            value={no}
            onChange={(e) => setNo(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-600">Name</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-600">Type (optional)</label>
          <input
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="Posting, Heading, Total"
          />
        </div>
        <button
          type="submit"
          className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          {editingId ? "Update G/L account" : "Add G/L account"}
        </button>
      </form>
    </div>
  );
}

export function DimensionManager({ dimensions }: { dimensions: DimensionInput[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [valueCode, setValueCode] = useState("");
  const [valueName, setValueName] = useState("");
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setEditingId(null);
    setCode("");
    setValueCode("");
    setValueName("");
    setActive(true);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { code, valueCode, valueName, active };
      const res = await fetch(editingId ? `/api/dimensions/${editingId}` : "/api/dimensions", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to save dimension value");
      resetForm();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save dimension value");
    }
  };

  const handleEdit = (dimension: DimensionInput) => {
    setEditingId(dimension.id);
    setCode(dimension.code);
    setValueCode(dimension.valueCode);
    setValueName(dimension.valueName);
    setActive(dimension.active);
    setError(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this dimension value?")) return;
    try {
      const res = await fetch(`/api/dimensions/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete dimension value");
      if (editingId === id) resetForm();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete dimension value");
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="grid grid-cols-4 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase text-slate-600">
          <span>Code</span>
          <span>Value code</span>
          <span>Value name</span>
          <span className="text-right">Active</span>
        </div>
        <ul className="divide-y divide-slate-100 text-sm">
          {dimensions.map((d) => (
            <li key={d.id} className="grid grid-cols-4 items-center px-3 py-3">
              <div className="font-mono text-slate-800">{d.code}</div>
              <div className="font-mono text-slate-800">{d.valueCode}</div>
              <div className="text-slate-800">{d.valueName}</div>
              <div className="text-right text-slate-700">{d.active ? "Yes" : "No"}</div>
              <div className="col-span-4 mt-2 flex gap-2 text-xs">
                <button className="text-slate-700 underline underline-offset-4" onClick={() => handleEdit(d)}>
                  Edit
                </button>
                <button className="text-red-600 underline underline-offset-4" onClick={() => handleDelete(d.id)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
          {dimensions.length === 0 && <li className="px-3 py-3 text-slate-600">No dimensions yet.</li>}
        </ul>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">{editingId ? "Edit dimension value" : "Add dimension value"}</div>
            <p className="text-xs text-slate-600">Create dimension codes and values locally</p>
          </div>
          {editingId && (
            <button type="button" className="text-xs text-slate-600 underline underline-offset-4" onClick={resetForm}>
              Cancel edit
            </button>
          )}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Code</label>
            <input
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Value code</label>
            <input
              required
              value={valueCode}
              onChange={(e) => setValueCode(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-600">Value name</label>
          <input
            required
            value={valueName}
            onChange={(e) => setValueName(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Active
        </label>
        <button
          type="submit"
          className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          {editingId ? "Update dimension value" : "Add dimension value"}
        </button>
      </form>
    </div>
  );
}

export function RuleManager({
  vendors,
  glAccounts,
  rules,
}: {
  vendors: VendorInput[];
  glAccounts: GlAccountInput[];
  rules: RuleInput[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [vendorId, setVendorId] = useState<string>(vendors[0]?.id ?? "");
  const [priority, setPriority] = useState<number>(10);
  const [matchType, setMatchType] = useState<MatchType>("description_contains");
  const [matchValue, setMatchValue] = useState<string>("");
  const [glAccountNo, setGlAccountNo] = useState<string>(glAccounts[0]?.no ?? "");
  const [dimensionOverrides, setDimensionOverrides] = useState<string>("");
  const [active, setActive] = useState<boolean>(true);
  const [comment, setComment] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setEditingId(null);
    setVendorId(vendors[0]?.id ?? "");
    setPriority(10);
    setMatchType("description_contains");
    setMatchValue("");
    setGlAccountNo(glAccounts[0]?.no ?? "");
    setDimensionOverrides("");
    setActive(true);
    setComment("");
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const dims = parseJsonInput(dimensionOverrides || "{}");
      const payload = {
        vendorId,
        priority,
        matchType,
        matchValue: matchValue || null,
        glAccountNo: glAccountNo || null,
        dimensionOverrides: dims,
        active,
        comment: comment || null,
      };
      const res = await fetch(editingId ? `/api/vendor-rules/${editingId}` : "/api/vendor-rules", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to save rule");
      resetForm();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save rule");
    }
  };

  const handleEdit = (rule: RuleInput) => {
    setEditingId(rule.id);
    setVendorId(rule.vendorId);
    setPriority(rule.priority);
    setMatchType(rule.matchType);
    setMatchValue(rule.matchValue ?? "");
    setGlAccountNo(rule.glAccountNo ?? "");
    setDimensionOverrides(rule.dimensionOverrides ? JSON.stringify(rule.dimensionOverrides) : "");
    setActive(rule.active);
    setComment(rule.comment ?? "");
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this rule?")) return;
    try {
      const res = await fetch(`/api/vendor-rules/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete rule");
      if (editingId === id) resetForm();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete rule");
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="grid grid-cols-7 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase text-slate-600">
          <span>Priority</span>
          <span>Vendor</span>
          <span className="col-span-2">Matcher</span>
          <span>GL</span>
          <span>Dimensions</span>
          <span className="text-right">Active</span>
        </div>
        <ul className="divide-y divide-slate-100 text-sm">
          {rules.map((r) => (
            <li key={r.id} className="grid grid-cols-7 gap-2 px-3 py-3">
              <div className="font-semibold text-slate-800">{r.priority}</div>
              <div className="text-slate-800">{r.vendorName ?? "—"}</div>
              <div className="col-span-2 text-xs font-mono text-slate-700">
                {r.matchType} • {r.matchValue ?? "—"}
                {r.comment ? <div className="text-[11px] text-slate-500">Note: {r.comment}</div> : null}
              </div>
              <div className="text-slate-800">{r.glAccountNo ?? "—"}</div>
              <div className="text-[11px] text-slate-700">{formatDims(r.dimensionOverrides ?? {})}</div>
              <div className="text-right text-slate-700">
                {r.active ? (
                  <span className="rounded-full bg-green-50 px-2 py-1 text-xs font-semibold text-green-700 ring-1 ring-green-200">
                    Yes
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                    No
                  </span>
                )}
              </div>
              <div className="col-span-7 mt-2 flex gap-2 text-xs">
                <button className="text-slate-700 underline underline-offset-4" onClick={() => handleEdit(r)}>
                  Edit
                </button>
                <button className="text-red-600 underline underline-offset-4" onClick={() => handleDelete(r.id)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
          {rules.length === 0 && <li className="px-3 py-3 text-slate-600">No vendor rules yet.</li>}
        </ul>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">{editingId ? "Edit rule" : "Add rule"}</div>
            <p className="text-xs text-slate-600">Set Continia-style vendor rules</p>
          </div>
          {editingId && (
            <button type="button" className="text-xs text-slate-600 underline underline-offset-4" onClick={resetForm}>
              Cancel edit
            </button>
          )}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-600">Vendor</label>
          <Select value={vendorId} onValueChange={setVendorId} disabled={vendors.length === 0}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={vendors.length === 0 ? "No vendors available" : "Choose vendor"} />
            </SelectTrigger>
            <SelectContent>
              {vendors.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.vendorNo} — {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Priority</label>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Match type</label>
            <Select value={matchType} onValueChange={(value) => setMatchType(value as MatchType)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="description_contains">Description contains</SelectItem>
                <SelectItem value="description_regex">Description regex</SelectItem>
                <SelectItem value="amount_equals">Amount equals</SelectItem>
                <SelectItem value="always">Always</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-600">Match value</label>
          <input
            value={matchValue}
            onChange={(e) => setMatchValue(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="comma-separated tokens or regex"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-600">G/L account</label>
          <Select value={glAccountNo} onValueChange={setGlAccountNo} disabled={glAccounts.length === 0}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={glAccounts.length === 0 ? "No G/L accounts available" : "Choose G/L account"} />
            </SelectTrigger>
            <SelectContent>
              {glAccounts.map((g) => (
                <SelectItem key={g.id} value={g.no}>
                  {g.no} — {g.name}
                  {g.type ? ` (${g.type})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-600">Dimension overrides (JSON)</label>
          <textarea
            value={dimensionOverrides}
            onChange={(e) => setDimensionOverrides(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            rows={3}
            placeholder='{"DEPARTMENT":"OPS"}'
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-600">Comment</label>
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Active
        </label>
        <button
          type="submit"
          className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          disabled={vendors.length === 0 || glAccounts.length === 0}
        >
          {editingId ? "Update rule" : "Add rule"}
        </button>
      </form>
    </div>
  );
}
