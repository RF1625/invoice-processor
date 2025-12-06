export type NavVendor = {
  no: string;
  name: string;
  currencyCode?: string;
  city?: string;
  country?: string;
};

export type NavGlAccount = {
  no: string;
  name: string;
  type?: "Posting" | "Heading" | "Total";
};

export type NavDimension = {
  code: string;
  name: string;
  values: { code: string; name: string }[];
};

export const mockVendors: NavVendor[] = [
  { no: "10000", name: "South Freight & Cartage Ltd", city: "Port Chalmers", country: "NZ" },
  { no: "20000", name: "Blue Sky Meats (NZ) Ltd", city: "Invercargill", country: "NZ" },
  { no: "30000", name: "Contoso Supplies", currencyCode: "USD", city: "Seattle", country: "US" },
];

export const mockGlAccounts: NavGlAccount[] = [
  { no: "6210", name: "Freight and Cartage", type: "Posting" },
  { no: "6220", name: "Fuel Surcharge", type: "Posting" },
  { no: "6230", name: "Pallet Handling", type: "Posting" },
  { no: "7000", name: "General Purchases", type: "Posting" },
];

export const mockDimensions: NavDimension[] = [
  {
    code: "DEPARTMENT",
    name: "Department",
    values: [
      { code: "OPS", name: "Operations" },
      { code: "FIN", name: "Finance" },
      { code: "IT", name: "IT" },
    ],
  },
  {
    code: "PROJECT",
    name: "Project",
    values: [
      { code: "PORTS", name: "Port Operations" },
      { code: "LOGI", name: "Logistics" },
      { code: "GEN", name: "General" },
    ],
  },
];
