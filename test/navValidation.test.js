require("ts-node/register");
const t = require("tap");
const { validateNavPayload } = require("../lib/navClient");

t.test("validateNavPayload passes with valid payload", (t) => {
  const payload = {
    vendorNo: "10000",
    vendorInvoiceNo: "INV-123",
    lines: [{ description: "Freight", quantity: 1, directUnitCost: 100, amount: 100, glAccountNo: "6210" }],
  };
  t.doesNotThrow(() => validateNavPayload(payload));
  t.end();
});

t.test("validateNavPayload fails without vendorNo", (t) => {
  const payload = {
    vendorNo: "",
    lines: [{ description: "Item", quantity: 1, directUnitCost: 10, amount: 10, glAccountNo: "UNMAPPED" }],
  };
  t.throws(() => validateNavPayload(payload), /vendorNo is required/);
  t.end();
});

t.test("validateNavPayload fails with UNMAPPED GL", (t) => {
  const payload = {
    vendorNo: "10000",
    lines: [{ description: "Item", quantity: 1, directUnitCost: 10, amount: 10, glAccountNo: "UNMAPPED" }],
  };
  t.throws(() => validateNavPayload(payload), /missing GL account/);
  t.end();
});
