"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { DimensionInput, GlAccountInput, InvoiceInput, RuleInput, VendorInput } from "@/lib/database-cache";
import type { MatchType } from "@prisma/client";

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

type ConfirmDialogOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type ConfirmDialogState = ConfirmDialogOptions & { resolve: (confirmed: boolean) => void };

const useConfirmDialog = () => {
  const [state, setState] = useState<ConfirmDialogState | null>(null);

  const confirm = (options: ConfirmDialogOptions) =>
    new Promise<boolean>((resolve) => {
      setState({ ...options, resolve });
    });

  const closeDialog = (confirmed: boolean) => {
    setState((current) => {
      if (current) current.resolve(confirmed);
      return null;
    });
  };

  const dialog = state ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="text-lg font-semibold text-slate-900">{state.title ?? "Confirm delete"}</div>
        <p className="mt-2 text-sm text-slate-600">{state.message}</p>
        <div className="mt-6 flex items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => closeDialog(false)}>
            {state.cancelLabel ?? "Cancel"}
          </Button>
          <Button
            type="button"
            variant={state.destructive ? "destructive" : "default"}
            size="sm"
            onClick={() => closeDialog(true)}
          >
            {state.confirmLabel ?? "Confirm"}
          </Button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, dialog };
};

type InvoiceEditForm = {
  invoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  currencyCode: string;
  totalAmount: string;
  taxAmount: string;
  netAmount: string;
  vendorName: string;
  vendorAddress: string;
  customerName: string;
  customerAddress: string;
  gstNumber: string;
  paymentTerms: string;
  bankAccount: string;
};

type InvoiceDetailsState = {
  loading: boolean;
  error: string | null;
  invoice?: any;
  form?: InvoiceEditForm;
  saving: boolean;
  saveError: string | null;
  saveSuccess: string | null;
  fileStatus: "unknown" | "ready" | "missing";
};

const asRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : null;

const toDateInput = (value: unknown) => {
  if (!value) return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    return trimmed.includes("T") ? trimmed.split("T")[0] : trimmed.slice(0, 10);
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return "";
};

const toNumber = (value: unknown) => {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
};

const formatAmount = (value: unknown) => {
  const num = toNumber(value);
  return num == null ? "" : num.toFixed(2);
};

const pickPayloadValue = (canonical: Record<string, any> | null, original: Record<string, any> | null, keys: string[]) => {
  for (const key of keys) {
    const value = canonical?.[key];
    if (value != null && value !== "") return String(value);
  }
  for (const key of keys) {
    const value = original?.[key];
    if (value != null && value !== "") return String(value);
  }
  return "";
};

const buildInvoiceEditForm = (invoice: any): InvoiceEditForm => {
  const canonical = asRecord(invoice?.canonicalJson);
  const original = asRecord(invoice?.originalPayload);
  const fallbackInvoiceNo = pickPayloadValue(canonical, original, ["invoiceId", "invoice_id"]);
  const fallbackInvoiceDate = pickPayloadValue(canonical, original, ["invoiceDate", "invoice_date"]);
  const fallbackDueDate = pickPayloadValue(canonical, original, ["dueDate"]);
  const fallbackCurrency = pickPayloadValue(canonical, original, ["currencyCode", "currency"]);

  return {
    invoiceNo: invoice?.invoiceNo ?? fallbackInvoiceNo ?? "",
    invoiceDate: toDateInput(invoice?.invoiceDate ?? fallbackInvoiceDate),
    dueDate: toDateInput(invoice?.dueDate ?? fallbackDueDate),
    currencyCode: invoice?.currencyCode ?? fallbackCurrency ?? "",
    totalAmount: formatAmount(invoice?.totalAmount),
    taxAmount: formatAmount(invoice?.taxAmount),
    netAmount: formatAmount(invoice?.netAmount),
    vendorName: pickPayloadValue(canonical, original, ["vendorName"]),
    vendorAddress: pickPayloadValue(canonical, original, ["vendorAddress"]),
    customerName: pickPayloadValue(canonical, original, ["customerName"]),
    customerAddress: pickPayloadValue(canonical, original, ["customerAddress"]),
    gstNumber: pickPayloadValue(canonical, original, ["gstNumber"]),
    paymentTerms: pickPayloadValue(canonical, original, ["paymentTerms"]),
    bankAccount: pickPayloadValue(canonical, original, ["bankAccount"]),
  };
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
  const { confirm: requestConfirm, dialog } = useConfirmDialog();

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
    const confirmed = await requestConfirm({
      title: "Delete vendor",
      message: "Delete this vendor? This will also remove its rules.",
      confirmLabel: "Delete vendor",
      destructive: true,
    });
    if (!confirmed) return;
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
    <>
      {dialog}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
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
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-slate-700"
                      onClick={() => handleEdit(v)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-red-600"
                      onClick={() => handleDelete(v.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
              {vendors.length === 0 && <li className="px-3 py-3 text-slate-600">No vendors yet.</li>}
            </ul>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900">{editingId ? "Edit vendor" : "Add vendor"}</div>
              <p className="text-xs text-slate-600">Maintain vendor master data stored in Supabase</p>
            </div>
            {editingId && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-slate-600"
                onClick={resetForm}
              >
                Cancel edit
              </Button>
            )}
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-600">Vendor #</Label>
            <Input required value={vendorNo} onChange={(e) => setVendorNo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-600">Name</Label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-600">GST number</Label>
              <Input value={gstNumber} onChange={(e) => setGstNumber(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-600">Default currency</Label>
              <Input value={defaultCurrency} onChange={(e) => setDefaultCurrency(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-600">Default dimensions (JSON)</Label>
            <Textarea
              value={defaultDimensions}
              onChange={(e) => setDefaultDimensions(e.target.value)}
              rows={3}
              placeholder='{"DEPARTMENT":"OPS"}'
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <Checkbox checked={active} onCheckedChange={(checked) => setActive(Boolean(checked))} />
            Active
          </label>
          <Button type="submit" className="w-full">
            {editingId ? "Update vendor" : "Add vendor"}
          </Button>
        </form>
      </div>
    </>
  );
}

export function InvoiceApprovalPanel({ invoices }: { invoices: InvoiceInput[] }) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visibleInvoices, setVisibleInvoices] = useState<InvoiceInput[]>(invoices);
  const [approverOptions, setApproverOptions] = useState<{ id: string; label: string; active: boolean }[]>([]);
  const [approverOverrides, setApproverOverrides] = useState<Record<string, string | null>>({});
  const [approverLoading, setApproverLoading] = useState(true);
  const [approverSavingId, setApproverSavingId] = useState<string | null>(null);
  const [detailsById, setDetailsById] = useState<Record<string, InvoiceDetailsState>>({});
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [invoiceOverrides, setInvoiceOverrides] = useState<Record<string, { invoiceNo?: string | null; currencyCode?: string | null; totalAmount?: number }>>({});
  const { confirm: requestConfirm, dialog } = useConfirmDialog();

  useEffect(() => {
    setVisibleInvoices(invoices);
  }, [invoices]);

  useEffect(() => {
    const next: Record<string, string | null> = {};
    invoices.forEach((inv) => {
      next[inv.id] = inv.approvalApprover?.id ?? null;
    });
    setApproverOverrides(next);
  }, [invoices]);

  useEffect(() => {
    let active = true;
    const loadApprovers = async () => {
      setApproverLoading(true);
      try {
        const res = await fetch("/api/approval-setups", { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? "Failed to load approvers");
        const options = (json.users ?? []).map((u: any) => {
          const label = u.name ? `${u.name} (${u.email})` : u.email;
          const hasSetup = Boolean(u.setup);
          const active = hasSetup && u.setup?.active !== false;
          const suffix = hasSetup ? (active ? "" : " (inactive)") : " (needs setup)";
          return { id: u.userId, label: `${label}${suffix}`, active };
        });
        if (active) setApproverOptions(options);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Failed to load approvers");
      } finally {
        if (active) setApproverLoading(false);
      }
    };

    void loadApprovers();
    return () => {
      active = false;
    };
  }, []);

  const loadDetails = async (invoiceId: string) => {
    setDetailsById((current) => ({
      ...current,
      [invoiceId]: {
        ...current[invoiceId],
        loading: true,
        error: null,
        saving: false,
        saveError: null,
        saveSuccess: null,
        fileStatus: current[invoiceId]?.fileStatus ?? "unknown",
      },
    }));

    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed to load invoice");
      const invoice = json.invoice;
      const form = buildInvoiceEditForm(invoice);
      const fileStatus = invoice?.files?.length ? "unknown" : "missing";
      setDetailsById((current) => ({
        ...current,
        [invoiceId]: {
          loading: false,
          error: null,
          invoice,
          form,
          saving: false,
          saveError: null,
          saveSuccess: null,
          fileStatus,
        },
      }));

      if (invoice?.files?.length) {
        const headRes = await fetch(`/api/invoices/${invoiceId}/file`, { method: "HEAD" });
        setDetailsById((current) => {
          const entry = current[invoiceId];
          if (!entry) return current;
          return {
            ...current,
            [invoiceId]: {
              ...entry,
              fileStatus: headRes.ok ? "ready" : "missing",
            },
          };
        });
      }
    } catch (err) {
      setDetailsById((current) => ({
        ...current,
        [invoiceId]: {
          ...current[invoiceId],
          loading: false,
          error: err instanceof Error ? err.message : "Failed to load invoice",
          saving: false,
          saveError: null,
          saveSuccess: null,
          fileStatus: current[invoiceId]?.fileStatus ?? "missing",
        },
      }));
    }
  };

  const toggleDetails = (invoiceId: string) => {
    const isOpen = Boolean(expandedIds[invoiceId]);
    const nextOpen = !isOpen;
    setExpandedIds((current) => ({ ...current, [invoiceId]: nextOpen }));
    if (nextOpen && !detailsById[invoiceId]) {
      void loadDetails(invoiceId);
    }
  };

  const updateDetailForm = (invoiceId: string, updates: Partial<InvoiceEditForm>) => {
    setDetailsById((current) => {
      const entry = current[invoiceId];
      if (!entry?.form) return current;
      return {
        ...current,
        [invoiceId]: {
          ...entry,
          form: { ...entry.form, ...updates },
          saveSuccess: null,
        },
      };
    });
  };

  const resetDetailsForm = (invoiceId: string) => {
    setDetailsById((current) => {
      const entry = current[invoiceId];
      if (!entry?.invoice) return current;
      return {
        ...current,
        [invoiceId]: {
          ...entry,
          form: buildInvoiceEditForm(entry.invoice),
          saveError: null,
          saveSuccess: null,
        },
      };
    });
  };

  const dropInvoiceState = (invoiceId: string) => {
    setDetailsById((current) => {
      const { [invoiceId]: _, ...rest } = current;
      return rest;
    });
    setExpandedIds((current) => {
      const { [invoiceId]: _, ...rest } = current;
      return rest;
    });
    setInvoiceOverrides((current) => {
      const { [invoiceId]: _, ...rest } = current;
      return rest;
    });
    setApproverOverrides((current) => {
      const { [invoiceId]: _, ...rest } = current;
      return rest;
    });
  };

  const saveDetails = async (invoiceId: string) => {
    const entry = detailsById[invoiceId];
    if (!entry?.form || entry.saving) return;
    const form = entry.form;
    const payload = {
      invoiceNo: form.invoiceNo.trim() || null,
      invoiceDate: form.invoiceDate.trim() || null,
      dueDate: form.dueDate.trim() || null,
      currencyCode: form.currencyCode.trim() || null,
      totalAmount: form.totalAmount.trim(),
      taxAmount: form.taxAmount.trim(),
      netAmount: form.netAmount.trim(),
      vendorName: form.vendorName.trim() || null,
      vendorAddress: form.vendorAddress.trim() || null,
      customerName: form.customerName.trim() || null,
      customerAddress: form.customerAddress.trim() || null,
      gstNumber: form.gstNumber.trim() || null,
      paymentTerms: form.paymentTerms.trim() || null,
      bankAccount: form.bankAccount.trim() || null,
    };

    const previousOverride = invoiceOverrides[invoiceId];
    const optimisticTotal = Number(payload.totalAmount);
    setInvoiceOverrides((current) => ({
      ...current,
      [invoiceId]: {
        invoiceNo: payload.invoiceNo,
        currencyCode: payload.currencyCode,
        totalAmount: Number.isFinite(optimisticTotal) ? optimisticTotal : current[invoiceId]?.totalAmount,
      },
    }));

    setDetailsById((current) => ({
      ...current,
      [invoiceId]: {
        ...current[invoiceId],
        saving: true,
        saveError: null,
        saveSuccess: null,
      },
    }));

    try {
      const res = await fetch(`/api/invoices/${invoiceId}/edit`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed to save invoice");
      const invoice = json.invoice ?? entry.invoice;
      const nextForm = buildInvoiceEditForm(invoice);
      setDetailsById((current) => ({
        ...current,
        [invoiceId]: {
          ...current[invoiceId],
          invoice,
          form: nextForm,
          saving: false,
          saveError: null,
          saveSuccess: "Saved",
        },
      }));
      setInvoiceOverrides((current) => ({
        ...current,
        [invoiceId]: {
          invoiceNo: invoice?.invoiceNo ?? payload.invoiceNo,
          currencyCode: invoice?.currencyCode ?? payload.currencyCode,
          totalAmount: Number.isFinite(Number(invoice?.totalAmount))
            ? Number(invoice?.totalAmount)
            : current[invoiceId]?.totalAmount,
        },
      }));
      router.refresh();
    } catch (err) {
      setInvoiceOverrides((current) => {
        if (!previousOverride) {
          const { [invoiceId]: _, ...rest } = current;
          return rest;
        }
        return { ...current, [invoiceId]: previousOverride };
      });
      setDetailsById((current) => ({
        ...current,
        [invoiceId]: {
          ...current[invoiceId],
          saving: false,
          saveError: err instanceof Error ? err.message : "Failed to save invoice",
          saveSuccess: null,
        },
      }));
    }
  };

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

  const assignApprover = async (invoiceId: string, approverUserId: string | null) => {
    const previous = approverOverrides[invoiceId] ?? null;
    setApproverSavingId(invoiceId);
    setApproverOverrides((current) => ({ ...current, [invoiceId]: approverUserId }));
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/approver`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approverUserId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed to update approver");
      router.refresh();
    } catch (err) {
      setApproverOverrides((current) => ({ ...current, [invoiceId]: previous }));
      setError(err instanceof Error ? err.message : "Failed to update approver");
    } finally {
      setApproverSavingId(null);
    }
  };

  const deleteInvoice = async (invoiceId: string) => {
    const confirmed = await requestConfirm({
      title: "Delete invoice",
      message: "Delete this invoice and its PDF? This cannot be undone.",
      confirmLabel: "Delete invoice",
      destructive: true,
    });
    if (!confirmed) return;
    setDeletingId(invoiceId);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed to delete invoice");
      if (json.storageDeleted === false) {
        setError("Invoice deleted, but PDF removal from storage failed.");
      }
      dropInvoiceState(invoiceId);
      setVisibleInvoices((current) => current.filter((inv) => inv.id !== invoiceId));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete invoice");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      {dialog}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Invoices & approvals</h2>
            <p className="text-xs text-slate-600">Track approval state and history per invoice</p>
          </div>
          {error && <div className="text-xs text-red-600">{error}</div>}
        </div>
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-100">
            <div className="min-w-[960px]">
              <div className="grid grid-cols-7 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase text-slate-600">
                <span>Invoice #</span>
                <span>Vendor</span>
                <span>Approver</span>
              <span>Status</span>
              <span className="text-right">Total</span>
              <span>Last approval</span>
              <span className="text-right">Actions</span>
              </div>
              <ul className="divide-y divide-slate-100 text-sm">
              {visibleInvoices.map((inv) => {
            const lastApproval = inv.approvals[0];
            const assignedApproverId = approverOverrides[inv.id] ?? inv.approvalApprover?.id ?? null;
            const selectValue = assignedApproverId ?? "__auto__";
            const detail = detailsById[inv.id];
            const isExpanded = Boolean(expandedIds[inv.id]);
            const override = invoiceOverrides[inv.id];
            const invoiceNoLabel = (override?.invoiceNo ?? inv.invoiceNo) || "—";
            const currencyLabel = override?.currencyCode ?? inv.currencyCode ?? "";
            const totalValue = override?.totalAmount ?? inv.totalAmount;
            const fallbackApprover =
              inv.approvalApprover && !approverOptions.some((opt) => opt.id === inv.approvalApprover?.id)
                ? {
                    id: inv.approvalApprover.id,
                    label: inv.approvalApprover.name
                      ? `${inv.approvalApprover.name} (${inv.approvalApprover.email})`
                      : inv.approvalApprover.email,
                  }
                : null;
            return (
              <li key={inv.id} className="grid grid-cols-7 items-center px-3 py-3">
                <div className="font-mono text-slate-800">{invoiceNoLabel}</div>
                <div className="text-slate-800">{inv.vendorName ?? "—"}</div>
                <div>
                  <Select
                    value={selectValue}
                    onValueChange={(value) => {
                      const next = value === "__auto__" ? null : value;
                      if (next === assignedApproverId) return;
                      void assignApprover(inv.id, next);
                    }}
                    disabled={approverLoading || approverSavingId === inv.id}
                  >
                    <SelectTrigger className="h-8 w-full text-xs">
                      <SelectValue placeholder={approverLoading ? "Loading..." : "Auto"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__auto__">Auto (approval chain)</SelectItem>
                      {fallbackApprover && (
                        <SelectItem value={fallbackApprover.id}>{fallbackApprover.label}</SelectItem>
                      )}
                      {approverOptions.map((opt) => (
                        <SelectItem key={opt.id} value={opt.id} disabled={!opt.active}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">{statusBadge(inv.status)}</div>
                <div className="text-right font-semibold text-slate-900">
                  {currencyLabel} {Number.isFinite(totalValue) ? totalValue.toFixed(2) : "0.00"}
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRequest(inv.id)}
                    disabled={loadingId === inv.id}
                  >
                    Request
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    onClick={() => handleApprove(inv.id)}
                    disabled={loadingId === inv.id || inv.status === "approved"}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                    onClick={() => handleReject(inv.id)}
                    disabled={loadingId === inv.id || inv.status === "rejected"}
                  >
                    Reject
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-red-200 text-red-700 hover:bg-red-50"
                    onClick={() => deleteInvoice(inv.id)}
                    disabled={deletingId === inv.id}
                  >
                    {deletingId === inv.id ? "Deleting..." : "Delete"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => toggleDetails(inv.id)}>
                    {isExpanded ? "Hide" : "Details"}
                  </Button>
                </div>
                {isExpanded && (
                  <div className="col-span-7 mt-3 rounded-lg border border-slate-200 bg-white p-3">
                    {!detail || detail.loading ? (
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-slate-600" />
                        Loading invoice details...
                      </div>
                    ) : detail?.error ? (
                      <div className="text-xs text-red-600">{detail.error}</div>
                    ) : detail?.form ? (
                      <div className="grid gap-4 lg:grid-cols-2">
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <div className="text-xs font-semibold uppercase text-slate-500">Invoice PDF</div>
                          <div className="mt-2">
                            {detail.fileStatus === "missing" ? (
                              <p className="text-xs text-slate-600">File not found in storage.</p>
                            ) : (
                              <>
                                <iframe
                                  title={`Invoice ${invoiceNoLabel} preview`}
                                  src={`/api/invoices/${inv.id}/file`}
                                  className="h-80 w-full rounded-md border border-slate-200 bg-white"
                                />
                                {detail.fileStatus === "unknown" && (
                                  <p className="mt-2 text-xs text-slate-500">Checking file availability...</p>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                        <form
                          className="space-y-3"
                          onSubmit={(e) => {
                            e.preventDefault();
                            void saveDetails(inv.id);
                          }}
                        >
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-1">
                              <Label className="text-xs font-semibold text-slate-600">Invoice #</Label>
                              <Input
                                value={detail.form.invoiceNo}
                                onChange={(e) => updateDetailForm(inv.id, { invoiceNo: e.target.value })}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs font-semibold text-slate-600">Currency</Label>
                              <Input
                                value={detail.form.currencyCode}
                                onChange={(e) => updateDetailForm(inv.id, { currencyCode: e.target.value })}
                                placeholder="USD"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs font-semibold text-slate-600">Invoice date</Label>
                              <DatePicker
                                value={detail.form.invoiceDate || null}
                                onChange={(next) => updateDetailForm(inv.id, { invoiceDate: next ?? "" })}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs font-semibold text-slate-600">Due date</Label>
                              <DatePicker
                                value={detail.form.dueDate || null}
                                onChange={(next) => updateDetailForm(inv.id, { dueDate: next ?? "" })}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs font-semibold text-slate-600">Total amount</Label>
                              <Input
                                type="number"
                                step="0.01"
                                inputMode="decimal"
                                value={detail.form.totalAmount}
                                onChange={(e) => updateDetailForm(inv.id, { totalAmount: e.target.value })}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs font-semibold text-slate-600">Tax amount</Label>
                              <Input
                                type="number"
                                step="0.01"
                                inputMode="decimal"
                                value={detail.form.taxAmount}
                                onChange={(e) => updateDetailForm(inv.id, { taxAmount: e.target.value })}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs font-semibold text-slate-600">Net amount</Label>
                              <Input
                                type="number"
                                step="0.01"
                                inputMode="decimal"
                                value={detail.form.netAmount}
                                onChange={(e) => updateDetailForm(inv.id, { netAmount: e.target.value })}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs font-semibold text-slate-600">Vendor name</Label>
                              <Input
                                value={detail.form.vendorName}
                                onChange={(e) => updateDetailForm(inv.id, { vendorName: e.target.value })}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs font-semibold text-slate-600">GST/VAT</Label>
                              <Input
                                value={detail.form.gstNumber}
                                onChange={(e) => updateDetailForm(inv.id, { gstNumber: e.target.value })}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs font-semibold text-slate-600">Customer name</Label>
                              <Input
                                value={detail.form.customerName}
                                onChange={(e) => updateDetailForm(inv.id, { customerName: e.target.value })}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs font-semibold text-slate-600">Payment terms</Label>
                              <Input
                                value={detail.form.paymentTerms}
                                onChange={(e) => updateDetailForm(inv.id, { paymentTerms: e.target.value })}
                              />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold text-slate-600">Vendor address</Label>
                            <Textarea
                              value={detail.form.vendorAddress}
                              onChange={(e) => updateDetailForm(inv.id, { vendorAddress: e.target.value })}
                              rows={2}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold text-slate-600">Customer address</Label>
                            <Textarea
                              value={detail.form.customerAddress}
                              onChange={(e) => updateDetailForm(inv.id, { customerAddress: e.target.value })}
                              rows={2}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold text-slate-600">Bank details</Label>
                            <Textarea
                              value={detail.form.bankAccount}
                              onChange={(e) => updateDetailForm(inv.id, { bankAccount: e.target.value })}
                              rows={2}
                            />
                          </div>
                          <div className="flex items-center justify-between gap-3 text-xs">
                            <div className="text-slate-500">
                              {detail.saveError && <span className="text-red-600">{detail.saveError}</span>}
                              {!detail.saveError && detail.saveSuccess && (
                                <span className="text-emerald-600">{detail.saveSuccess}</span>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <Button type="button" variant="outline" size="sm" onClick={() => resetDetailsForm(inv.id)}>
                                Reset
                              </Button>
                              <Button
                                type="submit"
                                variant="outline"
                                size="sm"
                                className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                disabled={detail.saving}
                              >
                                {detail.saving ? "Saving..." : "Save changes"}
                              </Button>
                            </div>
                          </div>
                        </form>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-600">No invoice details loaded.</div>
                    )}
                  </div>
                )}
                {inv.approvals.length > 0 && (
                  <div className="col-span-7 mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
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
              {visibleInvoices.length === 0 && <li className="px-3 py-3 text-slate-600">No invoices yet.</li>}
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}

export function GlAccountManager({ glAccounts }: { glAccounts: GlAccountInput[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [no, setNo] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { confirm: requestConfirm, dialog } = useConfirmDialog();

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
    const confirmed = await requestConfirm({
      title: "Delete G/L account",
      message: "Delete this G/L account?",
      confirmLabel: "Delete account",
      destructive: true,
    });
    if (!confirmed) return;
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
    <>
      {dialog}
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
                <Button variant="link" size="sm" className="h-auto p-0 text-slate-700" onClick={() => handleEdit(g)}>
                  Edit
                </Button>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-red-600"
                  onClick={() => handleDelete(g.id)}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
          {glAccounts.length === 0 && <li className="px-3 py-3 text-slate-600">No G/L accounts yet.</li>}
        </ul>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">{editingId ? "Edit G/L account" : "Add G/L account"}</div>
            <p className="text-xs text-slate-600">Manage chart of accounts without NAV</p>
          </div>
          {editingId && (
            <Button type="button" variant="link" size="sm" className="h-auto p-0 text-slate-600" onClick={resetForm}>
              Cancel edit
            </Button>
          )}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="space-y-1">
          <Label className="text-xs font-semibold text-slate-600">G/L number</Label>
          <Input
            required
            value={no}
            onChange={(e) => setNo(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-semibold text-slate-600">Name</Label>
          <Input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-semibold text-slate-600">Type (optional)</Label>
          <Input
            value={type}
            onChange={(e) => setType(e.target.value)}
            placeholder="Posting, Heading, Total"
          />
        </div>
        <Button type="submit" className="w-full">
          {editingId ? "Update G/L account" : "Add G/L account"}
        </Button>
      </form>
      </div>
    </>
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
  const { confirm: requestConfirm, dialog } = useConfirmDialog();

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
    const confirmed = await requestConfirm({
      title: "Delete dimension value",
      message: "Delete this dimension value?",
      confirmLabel: "Delete value",
      destructive: true,
    });
    if (!confirmed) return;
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
    <>
      {dialog}
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
                <Button variant="link" size="sm" className="h-auto p-0 text-slate-700" onClick={() => handleEdit(d)}>
                  Edit
                </Button>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-red-600"
                  onClick={() => handleDelete(d.id)}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
          {dimensions.length === 0 && <li className="px-3 py-3 text-slate-600">No dimensions yet.</li>}
        </ul>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">{editingId ? "Edit dimension value" : "Add dimension value"}</div>
            <p className="text-xs text-slate-600">Create dimension codes and values locally</p>
          </div>
          {editingId && (
            <Button type="button" variant="link" size="sm" className="h-auto p-0 text-slate-600" onClick={resetForm}>
              Cancel edit
            </Button>
          )}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-600">Code</Label>
            <Input
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-600">Value code</Label>
            <Input
              required
              value={valueCode}
              onChange={(e) => setValueCode(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-semibold text-slate-600">Value name</Label>
          <Input
            required
            value={valueName}
            onChange={(e) => setValueName(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <Checkbox checked={active} onCheckedChange={(checked) => setActive(Boolean(checked))} />
          Active
        </label>
        <Button type="submit" className="w-full">
          {editingId ? "Update dimension value" : "Add dimension value"}
        </Button>
      </form>
      </div>
    </>
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
  const [aiInstruction, setAiInstruction] = useState<string>("");
  const [aiDraftRules, setAiDraftRules] = useState<
    | Array<{
        priority?: number | null;
        matchType: MatchType;
        matchValue?: string | null;
        glAccountNo?: string | null;
        dimensionOverrides?: Record<string, string> | null;
        active?: boolean | null;
        comment?: string | null;
      }>
    | null
  >(null);
  const [aiNotes, setAiNotes] = useState<string[]>([]);
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);
  const [aiBusy, setAiBusy] = useState<boolean>(false);
  const { confirm: requestConfirm, dialog } = useConfirmDialog();

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

  const resetAi = () => {
    setAiInstruction("");
    setAiDraftRules(null);
    setAiNotes([]);
    setAiWarnings([]);
    setAiBusy(false);
  };

  const generateAiRules = async () => {
    const instruction = aiInstruction.trim();
    if (!vendorId) return;
    if (instruction.length < 5) {
      setAiWarnings(["Please add a little more detail (at least 5 characters)."]);
      return;
    }

    setAiBusy(true);
    setAiWarnings([]);
    setAiNotes([]);
    try {
      const res = await fetch("/api/vendor-rules/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorId, instruction }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.details ?? json.error ?? "Failed to generate rules");
      setAiDraftRules(Array.isArray(json.rules) ? json.rules : []);
      setAiNotes(Array.isArray(json.notes) ? json.notes : []);
      setAiWarnings(Array.isArray(json.warnings) ? json.warnings : []);
    } catch (err) {
      setAiWarnings([err instanceof Error ? err.message : "Failed to generate rules"]);
    } finally {
      setAiBusy(false);
    }
  };

  const saveAiRules = async () => {
    if (!vendorId || !aiDraftRules?.length) return;
    setAiBusy(true);
    setAiWarnings([]);
    try {
      const res = await fetch("/api/vendor-rules/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorId, draftRules: aiDraftRules, create: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.details ?? json.error ?? "Failed to save rules");
      resetAi();
      router.refresh();
    } catch (err) {
      setAiWarnings([err instanceof Error ? err.message : "Failed to save rules"]);
    } finally {
      setAiBusy(false);
    }
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
    const confirmed = await requestConfirm({
      title: "Delete rule",
      message: "Delete this rule?",
      confirmLabel: "Delete rule",
      destructive: true,
    });
    if (!confirmed) return;
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
    <>
      {dialog}
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
                <Button variant="link" size="sm" className="h-auto p-0 text-slate-700" onClick={() => handleEdit(r)}>
                  Edit
                </Button>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-red-600"
                  onClick={() => handleDelete(r.id)}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
          {rules.length === 0 && <li className="px-3 py-3 text-slate-600">No vendor rules yet.</li>}
        </ul>
      </div>

      <div className="space-y-4">
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900">AI rule builder</div>
              <p className="text-xs text-slate-600">Write instructions in plain English, preview, then save.</p>
            </div>
            {aiDraftRules?.length ? (
              <Button type="button" variant="link" size="sm" className="h-auto p-0 text-slate-600" onClick={resetAi}>
                Clear
              </Button>
            ) : null}
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-600">Vendor</Label>
            <Select value={vendorId} onValueChange={setVendorId} disabled={vendors.length === 0 || aiBusy}>
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

          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-600">Instructions</Label>
            <Textarea
              value={aiInstruction}
              onChange={(e) => setAiInstruction(e.target.value)}
              rows={4}
              placeholder={`Example: "If description contains 'freight' or 'shipping', use GL 6210. Otherwise use GL 6000 and set DEPARTMENT=OPS."`}
              disabled={aiBusy}
            />
          </div>

          {aiWarnings.length ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {aiWarnings.map((w, i) => (
                <div key={i}>{w}</div>
              ))}
            </div>
          ) : null}
          {aiNotes.length ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              {aiNotes.map((n, i) => (
                <div key={i}>{n}</div>
              ))}
            </div>
          ) : null}

          <div className="flex gap-2">
            <Button type="button" onClick={generateAiRules} disabled={aiBusy || vendors.length === 0}>
              {aiBusy ? "Working…" : "Generate rules"}
            </Button>
            <Button type="button" variant="outline" onClick={saveAiRules} disabled={aiBusy || !aiDraftRules?.length}>
              Save rules
            </Button>
          </div>

          {aiDraftRules?.length ? (
            <div className="space-y-2 pt-2">
              <div className="text-xs font-semibold uppercase text-slate-600">Preview</div>
              <ul className="space-y-2">
                {aiDraftRules.map((r, idx) => (
                  <li key={idx} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                    <div className="font-mono text-slate-800">
                      {r.matchType} • {r.matchValue ?? "—"} • prio {r.priority ?? 100}
                    </div>
                    <div className="text-slate-700">
                      GL: {r.glAccountNo ?? "—"} • Dims: {formatDims(r.dimensionOverrides ?? null)}
                    </div>
                    {r.comment ? <div className="text-slate-500">Note: {r.comment}</div> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

      <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">{editingId ? "Edit rule" : "Add rule"}</div>
            <p className="text-xs text-slate-600">Set Continia-style vendor rules</p>
          </div>
          {editingId && (
            <Button type="button" variant="link" size="sm" className="h-auto p-0 text-slate-600" onClick={resetForm}>
              Cancel edit
            </Button>
          )}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="space-y-1">
          <Label className="text-xs font-semibold text-slate-600">Vendor</Label>
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
            <Label className="text-xs font-semibold text-slate-600">Priority</Label>
            <Input
              type="number"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-600">Match type</Label>
            <Select value={matchType} onValueChange={(value) => setMatchType(value as MatchType)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="description_contains">Description contains</SelectItem>
                <SelectItem value="description_regex">Description regex</SelectItem>
                <SelectItem value="amount_equals">Amount equals</SelectItem>
                <SelectItem value="amount_lt">Amount less than</SelectItem>
                <SelectItem value="amount_lte">Amount ≤</SelectItem>
                <SelectItem value="amount_gt">Amount greater than</SelectItem>
                <SelectItem value="amount_gte">Amount ≥</SelectItem>
                <SelectItem value="always">Always</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-semibold text-slate-600">Match value</Label>
          <Input
            value={matchValue}
            onChange={(e) => setMatchValue(e.target.value)}
            placeholder="comma-separated tokens or regex"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-semibold text-slate-600">G/L account</Label>
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
          <Label className="text-xs font-semibold text-slate-600">Dimension overrides (JSON)</Label>
          <Textarea
            value={dimensionOverrides}
            onChange={(e) => setDimensionOverrides(e.target.value)}
            rows={3}
            placeholder='{"DEPARTMENT":"OPS"}'
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-semibold text-slate-600">Comment</Label>
          <Input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <Checkbox checked={active} onCheckedChange={(checked) => setActive(Boolean(checked))} />
          Active
        </label>
        <Button type="submit" className="w-full" disabled={vendors.length === 0 || glAccounts.length === 0}>
          {editingId ? "Update rule" : "Add rule"}
        </Button>
      </form>
      </div>
      </div>
    </>
  );
}
