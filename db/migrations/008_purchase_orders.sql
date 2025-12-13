BEGIN;

CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT (md5(random()::text || clock_timestamp()::text)::uuid),
  firm_id UUID NOT NULL REFERENCES firms (id) ON DELETE CASCADE,
  vendor_id UUID REFERENCES vendors (id) ON DELETE SET NULL,
  po_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  currency_code TEXT,
  order_date DATE,
  expected_date DATE,
  total_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  received_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  invoiced_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  description TEXT,
  notes TEXT,
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT purchase_orders_unique_firm_po UNIQUE (firm_id, po_number)
);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_firm_vendor ON purchase_orders (firm_id, vendor_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_firm_status ON purchase_orders (firm_id, status);

CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id UUID PRIMARY KEY DEFAULT (md5(random()::text || clock_timestamp()::text)::uuid),
  firm_id UUID NOT NULL REFERENCES firms (id) ON DELETE CASCADE,
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders (id) ON DELETE CASCADE,
  line_no INT NOT NULL DEFAULT 1,
  description TEXT,
  quantity NUMERIC(18, 4) NOT NULL DEFAULT 1,
  unit_cost NUMERIC(18, 4) NOT NULL DEFAULT 0,
  line_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  received_quantity NUMERIC(18, 4) NOT NULL DEFAULT 0,
  invoiced_quantity NUMERIC(18, 4) NOT NULL DEFAULT 0,
  gl_account_no TEXT,
  dimension_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT po_lines_unique_line UNIQUE (purchase_order_id, line_no)
);
CREATE INDEX IF NOT EXISTS idx_po_lines_order ON purchase_order_lines (purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_po_lines_firm_order_line ON purchase_order_lines (firm_id, purchase_order_id, line_no);

CREATE TABLE IF NOT EXISTS purchase_order_receipts (
  id UUID PRIMARY KEY DEFAULT (md5(random()::text || clock_timestamp()::text)::uuid),
  firm_id UUID NOT NULL REFERENCES firms (id) ON DELETE CASCADE,
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders (id) ON DELETE CASCADE,
  purchase_order_line_id UUID REFERENCES purchase_order_lines (id) ON DELETE SET NULL,
  receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
  quantity NUMERIC(18, 4) NOT NULL DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_po_receipts_order ON purchase_order_receipts (purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_po_receipts_line ON purchase_order_receipts (purchase_order_line_id);

-- Link invoices to PO lines for matching
ALTER TABLE invoice_lines ADD COLUMN IF NOT EXISTS po_line_id UUID REFERENCES purchase_order_lines (id) ON DELETE SET NULL;
ALTER TABLE invoice_lines ADD COLUMN IF NOT EXISTS matched_quantity NUMERIC(18, 4) NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_invoice_lines_po_line ON invoice_lines (po_line_id);

COMMIT;
