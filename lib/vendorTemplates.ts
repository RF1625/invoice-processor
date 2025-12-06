export type NavLineRule = {
  matchContains: string[];
  glAccountNo: string;
  dimensions?: Record<string, string>;
};

export type NavVendorTemplate = {
  navVendorNo: string;
  defaultHeaderDimensions?: Record<string, string>;
  lineRules: NavLineRule[];
};

export const vendorTemplates: Record<string, NavVendorTemplate> = {
  "South Freight & Cartage Ltd": {
    navVendorNo: "10000",
    defaultHeaderDimensions: { DEPARTMENT: "OPS", PROJECT: "PORTS" },
    lineRules: [
      {
        matchContains: ["cartage", "freight", "haulage"],
        glAccountNo: "6210",
        dimensions: { PROJECT: "PORTS", DEPARTMENT: "OPS" },
      },
      {
        matchContains: ["fuel surcharge", "fuel"],
        glAccountNo: "6220",
        dimensions: { DEPARTMENT: "OPS" },
      },
      {
        matchContains: ["pallet", "handling", "storage"],
        glAccountNo: "6230",
        dimensions: { PROJECT: "PORTS" },
      },
    ],
  },
  "Blue Sky Meats (NZ) Ltd": {
    navVendorNo: "20000",
    defaultHeaderDimensions: { DEPARTMENT: "OPS" },
    lineRules: [
      {
        matchContains: ["cartage", "transport", "logistics"],
        glAccountNo: "6210",
        dimensions: { PROJECT: "PORTS" },
      },
    ],
  },
  "Contoso Supplies": {
    navVendorNo: "30000",
    defaultHeaderDimensions: { DEPARTMENT: "FIN" },
    lineRules: [
      {
        matchContains: ["consulting", "advisory"],
        glAccountNo: "7000",
        dimensions: { DEPARTMENT: "FIN" },
      },
    ],
  },
};

export function findVendorTemplate(vendorName: string | null | undefined): NavVendorTemplate | null {
  if (!vendorName) return null;
  const normalized = vendorName.trim().toLowerCase();
  const entry = Object.entries(vendorTemplates).find(([name]) => name.toLowerCase() === normalized);
  return entry ? entry[1] : null;
}
