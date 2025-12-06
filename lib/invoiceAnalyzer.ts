import {
  AzureKeyCredential,
  DocumentAnalysisClient,
  type AnalyzedDocument,
  type DocumentField,
} from "@azure/ai-form-recognizer";
import { applyVendorRulesAndLog, type ParsedInvoice, type ParsedInvoiceItem } from "./ruleEngine";

const endpoint = process.env.AZURE_DOCINT_ENDPOINT;
const key = process.env.AZURE_DOCINT_KEY;

export const MAX_INVOICE_FILE_BYTES = 10 * 1024 * 1024; // 10MB guardrail for uploads

let client: DocumentAnalysisClient | null = null;

const getClient = () => {
  if (client) return client;
  if (!endpoint || !key) {
    throw new Error("Azure Document Intelligence credentials are not configured");
  }
  client = new DocumentAnalysisClient(endpoint, new AzureKeyCredential(key));
  return client;
};

const fieldToString = (field?: DocumentField | null) =>
  field?.kind === "string" ? field.value ?? field.content ?? null : field?.content ?? null;

const fieldToNumber = (field?: DocumentField | null) => {
  if (field?.kind === "number" || field?.kind === "integer") return field.value ?? null;
  if (field?.kind === "currency") return field.value?.amount ?? null;
  return null;
};

const fieldToDate = (field?: DocumentField | null) => {
  if (field?.kind === "date" && field.value) {
    return field.value.toISOString().split("T")[0];
  }
  return field?.content ?? null;
};

const fieldToPaymentDetails = (field?: DocumentField | null): string | null => {
  if (!field) return null;
  if (field.kind === "string") return field.value ?? field.content ?? null;
  if (field.kind === "array") {
    const parts =
      field.values
        ?.map((v) => fieldToPaymentDetails(v))
        .filter(Boolean) ?? [];
    return parts.length ? parts.join(" • ") : null;
  }
  if (field.kind === "object") {
    const parts: string[] = [];
    const props = field.properties ?? {};
    const bankName = fieldToString(props.BankName);
    const account = fieldToString(props.AccountNumber);
    const routing = fieldToString(props.RoutingNumber);
    const iban = fieldToString(props.IBAN);
    const swift = fieldToString(props.SwiftCode ?? props.Swift);
    const accountName = fieldToString(props.AccountName);
    if (bankName) parts.push(bankName);
    if (accountName) parts.push(`Acct: ${accountName}`);
    if (account) parts.push(`No: ${account}`);
    if (routing) parts.push(`Routing: ${routing}`);
    if (iban) parts.push(`IBAN: ${iban}`);
    if (swift) parts.push(`SWIFT: ${swift}`);
    return parts.length ? parts.join(" • ") : null;
  }
  return field.content ?? null;
};

const buildInvoiceSummary = (doc: AnalyzedDocument): ParsedInvoice => {
  const fields = doc.fields ?? {};
  const itemsField = fields.Items;
  const subTotal = fieldToNumber(fields.SubTotal ?? fields.Subtotal);
  const invoiceTotal = fieldToNumber(fields.InvoiceTotal ?? fields.Total);
  const taxAmount = fieldToNumber(fields.TotalTax ?? fields.Tax);
  const amountDue = fieldToNumber(fields.AmountDue);
  const computedTax =
    taxAmount != null
      ? taxAmount
      : invoiceTotal != null && subTotal != null
        ? invoiceTotal - subTotal
        : null;
  const taxRate =
    computedTax != null && subTotal
      ? Number(((computedTax / subTotal) * 100).toFixed(2))
      : fieldToNumber(fields.TaxRate);

  const items: ParsedInvoiceItem[] =
    itemsField?.kind === "array"
      ? itemsField.values
          .map((itemField) => {
            if (itemField?.kind !== "object") return null;
            const props = itemField.properties ?? {};
            return {
              description: fieldToString(props.Description),
              quantity: fieldToNumber(props.Quantity),
              unitPrice: fieldToNumber(props.UnitPrice),
              amount: fieldToNumber(props.Amount),
            };
          })
          .filter((item): item is ParsedInvoiceItem => Boolean(item))
      : [];

  return {
    vendorName: fieldToString(fields.VendorName),
    vendorAddress: fieldToString(fields.VendorAddress),
    customerName: fieldToString(fields.CustomerName),
    customerAddress: fieldToString(fields.CustomerAddress),
    invoiceId: fieldToString(fields.InvoiceId),
    invoiceDate: fieldToDate(fields.InvoiceDate),
    dueDate: fieldToDate(fields.DueDate),
    subTotal,
    taxAmount: computedTax,
    taxRate,
    amountDue: amountDue ?? invoiceTotal,
    invoiceTotal,
    gstNumber: fieldToString(fields.VendorTaxId ?? fields.CustomerTaxId ?? fields.VatNumber),
    currencyCode: fieldToString(fields.Currency),
    bankAccount: fieldToPaymentDetails(fields.PaymentDetails),
    paymentTerms: fieldToString(fields.PaymentTerms ?? fields.PaymentTerm),
    items,
    confidence: doc.confidence,
    pageRange: doc.boundingRegions?.map((r) => r.pageNumber) ?? [],
  };
};

export async function analyzeInvoiceBuffer(buffer: Buffer, opts?: { fileName?: string | null }) {
  if (buffer.byteLength === 0) {
    throw new Error("Uploaded file is empty");
  }

  if (buffer.byteLength > MAX_INVOICE_FILE_BYTES) {
    throw new Error("File too large. Please upload a file under 10MB.");
  }

  const poller = await getClient().beginAnalyzeDocument("prebuilt-invoice", buffer);
  const result = await poller.pollUntilDone();
  const doc = result.documents?.[0];

  if (!doc) {
    throw new Error("No invoice data found in document");
  }

  const invoice = buildInvoiceSummary(doc);
  const { invoice: processedInvoice, navPayload, ruleApplications } = await applyVendorRulesAndLog({
    invoice,
    navVendorNo: invoice.navVendorNo ?? null,
    fileName: opts?.fileName ?? null,
  });

  return {
    processedInvoice,
    navPayload,
    ruleApplications,
    modelId: result.modelId,
    pagesAnalyzed: result.pages?.length ?? 0,
  };
}
