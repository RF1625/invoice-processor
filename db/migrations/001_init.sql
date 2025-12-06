BEGIN;

-- UUID generation without extensions (compatible with restricted Azure PG)
-- md5(random()...)::uuid is a common extension-free pattern

CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT (md5(random()::text || clock_timestamp()::text)::uuid),
  nav_company_name TEXT NOT NULL,
  code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT companies_code_unique UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS vendors (
  id UUID PRIMARY KEY DEFAULT (md5(random()::text || clock_timestamp()::text)::uuid),
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  nav_vendor_no TEXT NOT NULL,
  name TEXT NOT NULL,
  currency_code TEXT,
  payment_terms_code TEXT,
  blocked BOOLEAN NOT NULL DEFAULT FALSE,
  tax_reg_no TEXT,
  city TEXT,
  country TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT vendors_unique_company_vendor UNIQUE (company_id, nav_vendor_no)
);

CREATE TABLE IF NOT EXISTS gl_accounts (
  id UUID PRIMARY KEY DEFAULT (md5(random()::text || clock_timestamp()::text)::uuid),
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  nav_gl_no TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT,
  blocked BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT gl_accounts_unique_company_gl UNIQUE (company_id, nav_gl_no)
);

CREATE TABLE IF NOT EXISTS dimensions (
  id UUID PRIMARY KEY DEFAULT (md5(random()::text || clock_timestamp()::text)::uuid),
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dimensions_unique_company_code UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS dimension_values (
  id UUID PRIMARY KEY DEFAULT (md5(random()::text || clock_timestamp()::text)::uuid),
  dimension_id UUID NOT NULL REFERENCES dimensions (id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  blocked BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dimension_values_unique_dim_code UNIQUE (dimension_id, code)
);

CREATE TABLE IF NOT EXISTS dimension_sets (
  id UUID PRIMARY KEY DEFAULT (md5(random()::text || clock_timestamp()::text)::uuid),
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  values JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vendor_rules (
  id UUID PRIMARY KEY DEFAULT (md5(random()::text || clock_timestamp()::text)::uuid),
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  vendor_id UUID REFERENCES vendors (id) ON DELETE CASCADE,
  priority INT NOT NULL DEFAULT 100,
  matcher JSONB NOT NULL,
  gl_account_id UUID REFERENCES gl_accounts (id) ON DELETE SET NULL,
  default_dimension_set JSONB,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_rules_company_priority ON vendor_rules (company_id, priority);

CREATE TABLE IF NOT EXISTS invoice_runs (
  id UUID PRIMARY KEY DEFAULT (md5(random()::text || clock_timestamp()::text)::uuid),
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  vendor_id UUID REFERENCES vendors (id),
  nav_vendor_no TEXT,
  file_name TEXT,
  status TEXT NOT NULL,
  error TEXT,
  payload JSONB,
  nav_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
