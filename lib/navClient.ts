import { mockDimensions, mockGlAccounts, mockVendors } from "./navMock";

export type NavDimensionSet = Record<string, string>;

export type NavPurchaseInvoiceLine = {
  description: string;
  quantity: number;
  directUnitCost: number;
  amount: number;
  glAccountNo: string;
  dimensions?: NavDimensionSet;
};

export type NavPurchaseInvoicePayload = {
  vendorNo: string;
  vendorInvoiceNo?: string;
  postingDate?: string;
  dueDate?: string;
  currencyCode?: string;
  dimensions?: NavDimensionSet;
  lines: NavPurchaseInvoiceLine[];
};

const useMock = process.env.NAV_USE_MOCK === "true";
const navBaseUrl = process.env.NAV_BASE_URL?.replace(/\/$/, "") ?? null;
const navCompany = process.env.NAV_COMPANY ?? null;
const navUser = process.env.NAV_USER ?? null;
const navPassword = process.env.NAV_PASSWORD ?? null;
const purchasePath = process.env.NAV_PURCHASE_INVOICE_PATH ?? "PurchaseInvoices";

const requireNavConfig = () => {
  if (!navBaseUrl || !navCompany || !navUser || !navPassword) {
    throw new Error("NAV client not configured. Set NAV_BASE_URL, NAV_COMPANY, NAV_USER, and NAV_PASSWORD.");
  }
};

export async function getVendors() {
  if (useMock) return mockVendors;
  throw new Error("NAV client not configured (NAV_USE_MOCK is not enabled)");
}

export async function getGlAccounts() {
  if (useMock) return mockGlAccounts;
  throw new Error("NAV client not configured (NAV_USE_MOCK is not enabled)");
}

export async function getDimensions() {
  if (useMock) return mockDimensions;
  throw new Error("NAV client not configured (NAV_USE_MOCK is not enabled)");
}

export async function postPurchaseInvoice(payload: NavPurchaseInvoicePayload) {
  if (useMock) {
    console.info("[NAV MOCK] postPurchaseInvoice payload", JSON.stringify(payload, null, 2));
    return { status: "mocked", message: "NAV_USE_MOCK=true, payload logged only" };
  }

  requireNavConfig();

  const targetUrl = `${navBaseUrl}/Company('${encodeURIComponent(navCompany as string)}')/${purchasePath}`;
  const authHeader = `Basic ${Buffer.from(`${navUser}:${navPassword}`).toString("base64")}`;

  const res = await fetch(targetUrl, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const detail = typeof data === "string" ? data : JSON.stringify(data);
    throw new Error(`NAV request failed (${res.status}): ${detail}`);
  }

  return { status: "ok", message: "NAV accepted payload", data };
}
