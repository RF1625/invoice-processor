import { mockDimensions, mockGlAccounts, mockVendors } from "./navMock";

type NavConfig = {
  baseUrl: string;
  company: string;
  user: string;
  password: string;
  purchasePath: string;
  purchaseOrderPath: string;
};

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

export type NavPurchaseOrderPayload = {
  vendorNo: string;
  externalDocumentNo?: string;
  orderDate?: string;
  expectedDate?: string;
  currencyCode?: string;
  dimensions?: NavDimensionSet;
  lines: NavPurchaseInvoiceLine[];
};

const useMock = process.env.NAV_USE_MOCK === "true";

const resolveNavConfig = (firmCode?: string | null): NavConfig => {
  const suffix = firmCode ? `_${firmCode.replace(/[^A-Za-z0-9]/g, "").toUpperCase()}` : "";
  const baseUrl = (process.env[`NAV_BASE_URL${suffix}`] ?? process.env.NAV_BASE_URL)?.replace(/\/$/, "") ?? null;
  const company = process.env[`NAV_COMPANY${suffix}`] ?? process.env.NAV_COMPANY ?? null;
  const user = process.env[`NAV_USER${suffix}`] ?? process.env.NAV_USER ?? null;
  const password = process.env[`NAV_PASSWORD${suffix}`] ?? process.env.NAV_PASSWORD ?? null;
  const purchasePath =
    process.env[`NAV_PURCHASE_INVOICE_PATH${suffix}`] ?? process.env.NAV_PURCHASE_INVOICE_PATH ?? "PurchaseInvoices";
  const purchaseOrderPath =
    process.env[`NAV_PURCHASE_ORDER_PATH${suffix}`] ?? process.env.NAV_PURCHASE_ORDER_PATH ?? "PurchaseOrders";

  if (!baseUrl || !company || !user || !password) {
    throw new Error("NAV client not configured. Set NAV_BASE_URL, NAV_COMPANY, NAV_USER, and NAV_PASSWORD.");
  }

  return {
    baseUrl,
    company,
    user,
    password,
    purchasePath,
    purchaseOrderPath,
  };
};

export const validateNavPayload = (payload: NavPurchaseInvoicePayload | NavPurchaseOrderPayload) => {
  const errors: string[] = [];
  if (!payload.vendorNo) errors.push("vendorNo is required");
  if (!payload.lines.length) errors.push("at least one line is required");
  payload.lines.forEach((line, idx) => {
    if (!line.glAccountNo || line.glAccountNo === "UNMAPPED") {
      errors.push(`line ${idx + 1} missing GL account`);
    }
    if (line.amount == null || Number.isNaN(line.amount)) {
      errors.push(`line ${idx + 1} missing amount`);
    }
  });
  if (errors.length) {
    throw new Error(`NAV payload validation failed: ${errors.join("; ")}`);
  }
};

const fetchWithRetry = async (url: string, init: RequestInit, { retries = 2, timeoutMs = 15000 } = {}) => {
  let attempt = 0;
  let lastErr: unknown;
  while (attempt <= retries) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      attempt += 1;
      if (attempt > retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("NAV request failed");
};

export async function getVendors(_firmCode?: string | null) {
  if (useMock) return mockVendors;
  throw new Error("NAV client not configured (NAV_USE_MOCK is not enabled)");
}

export async function getGlAccounts(_firmCode?: string | null) {
  if (useMock) return mockGlAccounts;
  throw new Error("NAV client not configured (NAV_USE_MOCK is not enabled)");
}

export async function getDimensions(_firmCode?: string | null) {
  if (useMock) return mockDimensions;
  throw new Error("NAV client not configured (NAV_USE_MOCK is not enabled)");
}

export async function postPurchaseInvoice(payload: NavPurchaseInvoicePayload, firmCode?: string | null) {
  if (useMock) {
    console.info("[NAV MOCK] postPurchaseInvoice payload", JSON.stringify(payload, null, 2));
    return { status: "mocked", message: "NAV_USE_MOCK=true, payload logged only" };
  }

  validateNavPayload(payload);
  const config = resolveNavConfig(firmCode);

  const targetUrl = `${config.baseUrl}/Company('${encodeURIComponent(config.company)}')/${config.purchasePath}`;
  const authHeader = `Basic ${Buffer.from(`${config.user}:${config.password}`).toString("base64")}`;

  const res = await fetchWithRetry(targetUrl, {
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

export async function postPurchaseOrder(payload: NavPurchaseOrderPayload, firmCode?: string | null) {
  if (useMock) {
    console.info("[NAV MOCK] postPurchaseOrder payload", JSON.stringify(payload, null, 2));
    return { status: "mocked", message: "NAV_USE_MOCK=true, payload logged only" };
  }

  validateNavPayload(payload);
  const config = resolveNavConfig(firmCode);

  const targetUrl = `${config.baseUrl}/Company('${encodeURIComponent(config.company)}')/${config.purchaseOrderPath}`;
  const authHeader = `Basic ${Buffer.from(`${config.user}:${config.password}`).toString("base64")}`;

  const res = await fetchWithRetry(targetUrl, {
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

  return { status: "ok", message: "NAV accepted PO payload", data };
}
