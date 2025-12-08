BEGIN;

-- Multi-tenant anchor
CREATE TABLE IF NOT EXISTS firms (
  id UUID PRIMARY KEY DEFAULT (md5(random()::text || clock_timestamp()::text)::uuid),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT firms_code_unique UNIQUE (code)
);

-- Seed a default firm so existing rows can be backfilled
INSERT INTO firms (name, code)
SELECT 'Default Firm', 'default'
WHERE NOT EXISTS (SELECT 1 FROM firms WHERE code = 'default');

-- Vendors scoped by firm
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS firm_id UUID;
UPDATE vendors SET firm_id = (SELECT id FROM firms WHERE code = 'default') WHERE firm_id IS NULL;
ALTER TABLE vendors ALTER COLUMN firm_id SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendors_firm_fk') THEN
    ALTER TABLE vendors ADD CONSTRAINT vendors_firm_fk FOREIGN KEY (firm_id) REFERENCES firms (id) ON DELETE CASCADE;
  END IF;
END
$$;
ALTER TABLE vendors DROP CONSTRAINT IF EXISTS vendors_vendor_no_key;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendors_unique_firm_vendor_no') THEN
    ALTER TABLE vendors ADD CONSTRAINT vendors_unique_firm_vendor_no UNIQUE (firm_id, vendor_no);
  END IF;
END
$$;

-- G/L accounts scoped by firm
ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS firm_id UUID;
UPDATE gl_accounts SET firm_id = (SELECT id FROM firms WHERE code = 'default') WHERE firm_id IS NULL;
ALTER TABLE gl_accounts ALTER COLUMN firm_id SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gl_accounts_firm_fk') THEN
    ALTER TABLE gl_accounts ADD CONSTRAINT gl_accounts_firm_fk FOREIGN KEY (firm_id) REFERENCES firms (id) ON DELETE CASCADE;
  END IF;
END
$$;
ALTER TABLE gl_accounts DROP CONSTRAINT IF EXISTS gl_accounts_no_key;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gl_accounts_unique_firm_no') THEN
    ALTER TABLE gl_accounts ADD CONSTRAINT gl_accounts_unique_firm_no UNIQUE (firm_id, no);
  END IF;
END
$$;

-- Dimensions scoped by firm
ALTER TABLE dimensions ADD COLUMN IF NOT EXISTS firm_id UUID;
UPDATE dimensions SET firm_id = (SELECT id FROM firms WHERE code = 'default') WHERE firm_id IS NULL;
ALTER TABLE dimensions ALTER COLUMN firm_id SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dimensions_firm_fk') THEN
    ALTER TABLE dimensions ADD CONSTRAINT dimensions_firm_fk FOREIGN KEY (firm_id) REFERENCES firms (id) ON DELETE CASCADE;
  END IF;
END
$$;
ALTER TABLE dimensions DROP CONSTRAINT IF EXISTS dimensions_code_value_code_key;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dimensions_unique_firm_code_value') THEN
    ALTER TABLE dimensions ADD CONSTRAINT dimensions_unique_firm_code_value UNIQUE (firm_id, code, value_code);
  END IF;
END
$$;

-- Vendor rules scoped by firm
ALTER TABLE vendor_rules ADD COLUMN IF NOT EXISTS firm_id UUID;
UPDATE vendor_rules vr SET firm_id = v.firm_id FROM vendors v WHERE vr.vendor_id = v.id;
UPDATE vendor_rules SET firm_id = (SELECT id FROM firms WHERE code = 'default') WHERE firm_id IS NULL;
ALTER TABLE vendor_rules ALTER COLUMN firm_id SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendor_rules_firm_fk') THEN
    ALTER TABLE vendor_rules ADD CONSTRAINT vendor_rules_firm_fk FOREIGN KEY (firm_id) REFERENCES firms (id) ON DELETE CASCADE;
  END IF;
END
$$;
CREATE INDEX IF NOT EXISTS idx_vendor_rules_firm_priority ON vendor_rules (firm_id, priority);

-- Runs scoped by firm
ALTER TABLE runs ADD COLUMN IF NOT EXISTS firm_id UUID;
UPDATE runs r SET firm_id = COALESCE(v.firm_id, (SELECT id FROM firms WHERE code = 'default')) FROM vendors v WHERE r.vendor_id = v.id;
UPDATE runs SET firm_id = (SELECT id FROM firms WHERE code = 'default') WHERE firm_id IS NULL;
ALTER TABLE runs ALTER COLUMN firm_id SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'runs_firm_fk') THEN
    ALTER TABLE runs ADD CONSTRAINT runs_firm_fk FOREIGN KEY (firm_id) REFERENCES firms (id) ON DELETE CASCADE;
  END IF;
END
$$;

-- Invoice headers
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT (md5(random()::text || clock_timestamp()::text)::uuid),
  firm_id UUID NOT NULL REFERENCES firms (id) ON DELETE CASCADE,
  vendor_id UUID REFERENCES vendors (id) ON DELETE SET NULL,
  run_id UUID REFERENCES runs (id) ON DELETE SET NULL,
  vendor_no TEXT,
  invoice_no TEXT,
  invoice_date DATE,
  due_date DATE,
  currency_code TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  total_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  original_payload JSONB,
  nav_document_no TEXT,
  nav_status TEXT,
  locked_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT invoices_unique_firm_invoice_no UNIQUE (firm_id, invoice_no)
);

CREATE INDEX IF NOT EXISTS idx_invoices_firm_vendor ON invoices (firm_id, vendor_id);
CREATE INDEX IF NOT EXISTS idx_invoices_firm_status ON invoices (firm_id, status);

-- Invoice lines
CREATE TABLE IF NOT EXISTS invoice_lines (
  id UUID PRIMARY KEY DEFAULT (md5(random()::text || clock_timestamp()::text)::uuid),
  firm_id UUID NOT NULL REFERENCES firms (id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  line_no INT NOT NULL DEFAULT 1,
  description TEXT,
  quantity NUMERIC(18, 4) NOT NULL DEFAULT 1,
  unit_cost NUMERIC(18, 4) NOT NULL DEFAULT 0,
  line_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  gl_account_no TEXT,
  dimension_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  tax_code TEXT,
  tax_rate NUMERIC(10, 4),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON invoice_lines (invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_firm_invoice_line ON invoice_lines (firm_id, invoice_id, line_no);

COMMIT;
