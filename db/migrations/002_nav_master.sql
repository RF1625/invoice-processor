BEGIN;

-- Reset prior NAV tables to align with the simplified master/rules design
DROP TABLE IF EXISTS invoice_runs CASCADE;
DROP TABLE IF EXISTS vendor_rules CASCADE;
DROP TABLE IF EXISTS dimension_values CASCADE;
DROP TABLE IF EXISTS dimension_sets CASCADE;
DROP TABLE IF EXISTS dimensions CASCADE;
DROP TABLE IF EXISTS gl_accounts CASCADE;
DROP TABLE IF EXISTS vendors CASCADE;
DROP TABLE IF EXISTS companies CASCADE;

DROP TYPE IF EXISTS match_type;

CREATE TYPE match_type AS ENUM ('description_contains', 'description_regex', 'amount_equals', 'always');

CREATE TABLE vendors (
  id UUID PRIMARY KEY DEFAULT (md5(random()::text || clock_timestamp()::text)::uuid),
  vendor_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  gst_number TEXT,
  default_dimensions JSONB NOT NULL DEFAULT '{}'::jsonb,
  default_currency TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE gl_accounts (
  id UUID PRIMARY KEY DEFAULT (md5(random()::text || clock_timestamp()::text)::uuid),
  no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE dimensions (
  id UUID PRIMARY KEY DEFAULT (md5(random()::text || clock_timestamp()::text)::uuid),
  code TEXT NOT NULL,
  value_code TEXT NOT NULL,
  value_name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dimensions_unique_code_value UNIQUE (code, value_code)
);

CREATE TABLE vendor_rules (
  id UUID PRIMARY KEY DEFAULT (md5(random()::text || clock_timestamp()::text)::uuid),
  vendor_id UUID NOT NULL REFERENCES vendors (id) ON DELETE CASCADE,
  priority INT NOT NULL DEFAULT 100,
  match_type match_type NOT NULL,
  match_value TEXT,
  gl_account_no TEXT,
  dimension_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_rules_vendor_priority ON vendor_rules (vendor_id, priority);

CREATE TABLE runs (
  id UUID PRIMARY KEY DEFAULT (md5(random()::text || clock_timestamp()::text)::uuid),
  vendor_id UUID REFERENCES vendors (id) ON DELETE SET NULL,
  vendor_no TEXT,
  file_name TEXT,
  status TEXT NOT NULL DEFAULT 'processed',
  error TEXT,
  invoice_payload JSONB,
  rule_applications JSONB,
  nav_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
