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

  throw new Error("NAV client not configured (NAV_USE_MOCK is not enabled)");
}
