require("ts-node/register");
const t = require("tap");
const { matchesVendorRule } = require("../lib/ruleEngine");

const baseRule = {
  id: "rule",
  firmId: "firm",
  vendorId: "vendor",
  priority: 100,
  glAccountNo: null,
  dimensionOverrides: {},
  active: true,
  comment: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

t.test("amount_lt matches when less than target", (t) => {
  const rule = { ...baseRule, matchType: "amount_lt", matchValue: "50" };
  t.equal(matchesVendorRule(rule, "x", 49.99), true);
  t.equal(matchesVendorRule(rule, "x", 50), false);
  t.end();
});

t.test("amount_lte matches when less than or equal", (t) => {
  const rule = { ...baseRule, matchType: "amount_lte", matchValue: "50" };
  t.equal(matchesVendorRule(rule, "x", 50), true);
  t.equal(matchesVendorRule(rule, "x", 50.01), false);
  t.end();
});

t.test("amount_gt matches when greater than target", (t) => {
  const rule = { ...baseRule, matchType: "amount_gt", matchValue: "50" };
  t.equal(matchesVendorRule(rule, "x", 50), false);
  t.equal(matchesVendorRule(rule, "x", 50.01), true);
  t.end();
});

t.test("amount_gte matches when greater than or equal", (t) => {
  const rule = { ...baseRule, matchType: "amount_gte", matchValue: "50" };
  t.equal(matchesVendorRule(rule, "x", 49.99), false);
  t.equal(matchesVendorRule(rule, "x", 50), true);
  t.end();
});

t.test("amount match types return false for invalid numeric matchValue", (t) => {
  const rule = { ...baseRule, matchType: "amount_lt", matchValue: "nope" };
  t.equal(matchesVendorRule(rule, "x", 1), false);
  t.end();
});

t.test("description_contains matches any token", (t) => {
  const rule = { ...baseRule, matchType: "description_contains", matchValue: "freight, shipping" };
  t.equal(matchesVendorRule(rule, "Shipping charge", 10), true);
  t.equal(matchesVendorRule(rule, "Office supplies", 10), false);
  t.end();
});

t.test("always matches when active", (t) => {
  const rule = { ...baseRule, matchType: "always", matchValue: null };
  t.equal(matchesVendorRule(rule, "anything", null), true);
  t.end();
});

t.test("inactive rules never match", (t) => {
  const rule = { ...baseRule, active: false, matchType: "always", matchValue: null };
  t.equal(matchesVendorRule(rule, "anything", 10), false);
  t.end();
});

