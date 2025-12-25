import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { validateRequestOrigin } from "@/lib/auth";
import { Prisma } from "@prisma/client";

const asRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};

const parseOptionalString = (value: unknown, field: string) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const parseOptionalDate = (value: unknown, field: string) => {
  if (value === undefined) return { date: undefined, text: undefined };
  if (value === null) return { date: null, text: null };
  if (typeof value !== "string") throw new Error(`${field} must be a string (YYYY-MM-DD)`);
  const trimmed = value.trim();
  if (!trimmed) return { date: null, text: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error(`${field} must be in YYYY-MM-DD format`);
  }
  const date = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} must be a valid date`);
  return { date, text: trimmed };
};

const parseOptionalDecimal = (value: unknown, field: string) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return new Prisma.Decimal(0);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${field} must be a number`);
    return new Prisma.Decimal(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return new Prisma.Decimal(0);
    const num = Number(trimmed);
    if (!Number.isFinite(num)) throw new Error(`${field} must be a number`);
    return new Prisma.Decimal(trimmed);
  }
  throw new Error(`${field} must be a number`);
};

const toDecimal = (value: Prisma.Decimal | string | number) =>
  value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const originCheck = validateRequestOrigin(req);
    if (!originCheck.ok) {
      return NextResponse.json({ error: originCheck.error }, { status: 403 });
    }

    const params = await context.params;
    const session = await requireSession();
    const firmId = session.firmId;
    const userId = session.userId;
    const body = await req.json();

    const invoiceNo = parseOptionalString(body.invoiceNo, "invoiceNo");
    const currencyCode = parseOptionalString(body.currencyCode, "currencyCode");
    const vendorName = parseOptionalString(body.vendorName, "vendorName");
    const vendorAddress = parseOptionalString(body.vendorAddress, "vendorAddress");
    const customerName = parseOptionalString(body.customerName, "customerName");
    const customerAddress = parseOptionalString(body.customerAddress, "customerAddress");
    const gstNumber = parseOptionalString(body.gstNumber, "gstNumber");
    const paymentTerms = parseOptionalString(body.paymentTerms, "paymentTerms");
    const bankAccount = parseOptionalString(body.bankAccount, "bankAccount");
    const invoiceDate = parseOptionalDate(body.invoiceDate, "invoiceDate");
    const dueDate = parseOptionalDate(body.dueDate, "dueDate");
    const totalAmount = parseOptionalDecimal(body.totalAmount, "totalAmount");
    const taxAmount = parseOptionalDecimal(body.taxAmount, "taxAmount");
    const netAmount = parseOptionalDecimal(body.netAmount, "netAmount");

    const invoice = await prisma.invoice.findFirst({ where: { id: params.id, firmId } });
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

    const updateData: Prisma.InvoiceUpdateInput = {};
    if (userId) updateData.updatedByUser = { connect: { id: userId } };
    if (invoiceNo !== undefined) updateData.invoiceNo = invoiceNo;
    if (invoiceDate.date !== undefined) updateData.invoiceDate = invoiceDate.date;
    if (dueDate.date !== undefined) updateData.dueDate = dueDate.date;
    if (currencyCode !== undefined) updateData.currencyCode = currencyCode ? currencyCode.toUpperCase() : null;

    const existingTotal = toDecimal(invoice.totalAmount);
    const existingTax = toDecimal(invoice.taxAmount);
    const existingNet = toDecimal(invoice.netAmount);
    const nextTotal = totalAmount ?? existingTotal;
    const nextTax = taxAmount ?? existingTax;
    const shouldRecalcNet = netAmount === undefined && (totalAmount !== undefined || taxAmount !== undefined);
    const nextNet = netAmount ?? (shouldRecalcNet ? nextTotal.minus(nextTax) : existingNet);

    if (totalAmount !== undefined) updateData.totalAmount = nextTotal;
    if (taxAmount !== undefined) updateData.taxAmount = nextTax;
    if (netAmount !== undefined || shouldRecalcNet) updateData.netAmount = nextNet;

    const canonical = asRecord(invoice.canonicalJson);
    const original = asRecord(invoice.originalPayload);
    let touchedCanonical = false;
    let touchedOriginal = false;

    const setCanonical = (key: string, value: unknown) => {
      canonical[key] = value;
      touchedCanonical = true;
    };
    const setOriginal = (key: string, value: unknown) => {
      original[key] = value;
      touchedOriginal = true;
    };

    if (invoiceNo !== undefined) {
      setCanonical("invoiceId", invoiceNo);
      setCanonical("invoice_id", invoiceNo);
      setOriginal("invoiceId", invoiceNo);
    }
    if (invoiceDate.text !== undefined) {
      setCanonical("invoiceDate", invoiceDate.text);
      setCanonical("invoice_date", invoiceDate.text);
      setOriginal("invoiceDate", invoiceDate.text);
    }
    if (dueDate.text !== undefined) {
      setCanonical("dueDate", dueDate.text);
      setOriginal("dueDate", dueDate.text);
    }
    if (currencyCode !== undefined) {
      const normalizedCurrency = currencyCode ? currencyCode.toUpperCase() : null;
      setCanonical("currencyCode", normalizedCurrency);
      setCanonical("currency", normalizedCurrency);
      setOriginal("currencyCode", normalizedCurrency);
    }
    if (totalAmount !== undefined) {
      const totalValue = nextTotal.toNumber();
      setCanonical("invoiceTotal", totalValue);
      setCanonical("total", totalValue);
      setCanonical("amountDue", totalValue);
      setOriginal("invoiceTotal", totalValue);
      setOriginal("amountDue", totalValue);
    }
    if (taxAmount !== undefined) {
      const taxValue = nextTax.toNumber();
      setCanonical("taxAmount", taxValue);
      setOriginal("taxAmount", taxValue);
    }
    if (netAmount !== undefined || shouldRecalcNet) {
      const netValue = nextNet.toNumber();
      setCanonical("subTotal", netValue);
      setOriginal("subTotal", netValue);
    }
    if (vendorName !== undefined) {
      setCanonical("vendorName", vendorName);
      setOriginal("vendorName", vendorName);
    }
    if (vendorAddress !== undefined) {
      setCanonical("vendorAddress", vendorAddress);
      setOriginal("vendorAddress", vendorAddress);
    }
    if (customerName !== undefined) {
      setCanonical("customerName", customerName);
      setOriginal("customerName", customerName);
    }
    if (customerAddress !== undefined) {
      setCanonical("customerAddress", customerAddress);
      setOriginal("customerAddress", customerAddress);
    }
    if (gstNumber !== undefined) {
      setCanonical("gstNumber", gstNumber);
      setOriginal("gstNumber", gstNumber);
    }
    if (paymentTerms !== undefined) {
      setCanonical("paymentTerms", paymentTerms);
      setOriginal("paymentTerms", paymentTerms);
    }
    if (bankAccount !== undefined) {
      setCanonical("bankAccount", bankAccount);
      setOriginal("bankAccount", bankAccount);
    }

    if (touchedCanonical) updateData.canonicalJson = canonical as Prisma.InputJsonValue;
    if (touchedOriginal) updateData.originalPayload = original as Prisma.InputJsonValue;

    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: updateData,
      include: {
        vendor: true,
        approvals: { orderBy: { createdAt: "desc" } },
        files: true,
        approvalApprover: { select: { id: true, name: true, email: true } },
      },
    });

    const safeInvoice = {
      ...updated,
      files: updated.files.map((file) => ({
        ...file,
        sizeBytes: file.sizeBytes != null ? Number(file.sizeBytes) : null,
      })),
    };
    return NextResponse.json({ invoice: safeInvoice }, { status: 200 });
  } catch (err) {
    if ((err as { code?: string })?.code === "P2002") {
      return NextResponse.json({ error: "Invoice number already exists" }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : "Failed to update invoice";
    const status = message.includes("Unauthorized") ? 401 : message.includes("must") ? 400 : 500;
    console.error("Failed to update invoice fields", err);
    return NextResponse.json({ error: message }, { status });
  }
}
