"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MatchType } from "@/lib/generated/prisma/client";

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

type GlAccountInput = { id: string; no: string; name: string };

const formatDims = (value: Record<string, string> | null | undefined) =>
  value && Object.keys(value).length > 0 ? JSON.stringify(value) : "—";

const parseJsonInput = (input: string) => {
  if (!input.trim()) return {};
  const parsed = JSON.parse(input);
  if (parsed && typeof parsed === "object") return parsed;
  throw new Error("Dimensions must be a JSON object");
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
            <p className="text-xs text-slate-600">Maintain NAV vendor master data</p>
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
          disabled={vendors.length === 0}
        >
          {editingId ? "Update rule" : "Add rule"}
        </button>
      </form>
    </div>
  );
}
