require("ts-node/register");
const t = require("tap");
const { __test__ } = require("../lib/ruleEngine");

t.test("isLikelyJunkVendorName blocks generic headings", (t) => {
  const { isLikelyJunkVendorName } = __test__;

  t.equal(isLikelyJunkVendorName("Invoice"), true);
  t.equal(isLikelyJunkVendorName("Tax Invoice"), true);
  t.equal(isLikelyJunkVendorName("Tax Invoice:"), true);
  t.equal(isLikelyJunkVendorName("TAX-INVOICE"), true);
  t.equal(isLikelyJunkVendorName("Invoice 12345"), true);
  t.equal(isLikelyJunkVendorName("GST Invoice"), true);

  t.equal(isLikelyJunkVendorName("Bill's Plumbing"), false);
  t.equal(isLikelyJunkVendorName("Invoice Solutions Ltd"), false);
  t.end();
});

t.test("shouldAutoCreateVendorFromInvoice enforces thresholds", (t) => {
  const { shouldAutoCreateVendorFromInvoice } = __test__;

  t.equal(
    shouldAutoCreateVendorFromInvoice({
      vendorText: "Acme Ltd",
      invoiceConfidence: 0.9,
      topCandidateScore: null,
    }),
    true,
  );

  t.equal(
    shouldAutoCreateVendorFromInvoice({
      vendorText: "Acme Ltd",
      invoiceConfidence: 0.89,
      topCandidateScore: null,
    }),
    false,
  );

  t.equal(
    shouldAutoCreateVendorFromInvoice({
      vendorText: "Acme Ltd",
      invoiceConfidence: 0.9,
      topCandidateScore: 0.6,
    }),
    false,
  );

  t.equal(
    shouldAutoCreateVendorFromInvoice({
      vendorText: "Acme Ltd",
      invoiceConfidence: 0.9,
      topCandidateScore: 0.59,
    }),
    true,
  );

  t.equal(
    shouldAutoCreateVendorFromInvoice({
      vendorText: "Invoice",
      invoiceConfidence: 0.95,
      topCandidateScore: null,
    }),
    false,
  );

  t.end();
});

