BEGIN;

-- Approval policy enum for deterministic rule actions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'approval_policy') THEN
    CREATE TYPE approval_policy AS ENUM ('none', 'manager');
  END IF;
END
$$;

-- Vendors: default approval policy (used when no rules specify otherwise)
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS default_approval_policy approval_policy NOT NULL DEFAULT 'manager';

-- Vendor aliases: suggestion layer only (never a rules key)
CREATE TABLE IF NOT EXISTS vendor_aliases (
  id UUID PRIMARY KEY DEFAULT (md5(random()::text || clock_timestamp()::text)::uuid),
  firm_id UUID NOT NULL REFERENCES firms (id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES vendors (id) ON DELETE CASCADE,
  alias_text TEXT NOT NULL,
  confidence_hint NUMERIC(5, 4) NOT NULL DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendor_aliases_unique_vendor_alias') THEN
    ALTER TABLE vendor_aliases ADD CONSTRAINT vendor_aliases_unique_vendor_alias UNIQUE (vendor_id, alias_text);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_vendor_aliases_firm_alias ON vendor_aliases (firm_id, alias_text);
CREATE INDEX IF NOT EXISTS idx_vendor_aliases_vendor ON vendor_aliases (vendor_id);

-- Canonical + raw payload storage for audit/debug
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS canonical_json JSONB,
  ADD COLUMN IF NOT EXISTS azure_raw_json JSONB,
  ADD COLUMN IF NOT EXISTS vendor_match_status TEXT NOT NULL DEFAULT 'unmatched',
  ADD COLUMN IF NOT EXISTS vendor_match_confidence NUMERIC(5, 4),
  ADD COLUMN IF NOT EXISTS recommended_approval_policy approval_policy;

ALTER TABLE invoice_lines
  ADD COLUMN IF NOT EXISTS canonical_json JSONB;

-- Rulesets: one per vendor; versions are immutable
CREATE TABLE IF NOT EXISTS rulesets (
  id UUID PRIMARY KEY DEFAULT (md5(random()::text || clock_timestamp()::text)::uuid),
  firm_id UUID NOT NULL REFERENCES firms (id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES vendors (id) ON DELETE CASCADE,
  active_version_id UUID,
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rulesets_unique_firm_vendor') THEN
    ALTER TABLE rulesets ADD CONSTRAINT rulesets_unique_firm_vendor UNIQUE (firm_id, vendor_id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_rulesets_firm_vendor ON rulesets (firm_id, vendor_id);

CREATE TABLE IF NOT EXISTS rule_versions (
  id UUID PRIMARY KEY DEFAULT (md5(random()::text || clock_timestamp()::text)::uuid),
  ruleset_id UUID NOT NULL REFERENCES rulesets (id) ON DELETE CASCADE,
  version INT NOT NULL,
  dsl_json JSONB NOT NULL,
  llm_trace_id TEXT,
  notes TEXT,
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rule_versions_unique_ruleset_version') THEN
    ALTER TABLE rule_versions ADD CONSTRAINT rule_versions_unique_ruleset_version UNIQUE (ruleset_id, version);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_rule_versions_ruleset ON rule_versions (ruleset_id, version DESC);

-- Now that rule_versions exists, hook up rulesets.active_version_id FK (optional)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rulesets_active_version_fk') THEN
    ALTER TABLE rulesets
      ADD CONSTRAINT rulesets_active_version_fk FOREIGN KEY (active_version_id) REFERENCES rule_versions (id) ON DELETE SET NULL;
  END IF;
END
$$;

-- Deterministic application log (audit trail)
CREATE TABLE IF NOT EXISTS rule_apply_log (
  id UUID PRIMARY KEY DEFAULT (md5(random()::text || clock_timestamp()::text)::uuid),
  firm_id UUID NOT NULL REFERENCES firms (id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  rule_version_id UUID NOT NULL REFERENCES rule_versions (id) ON DELETE CASCADE,
  decisions_json JSONB NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_by UUID REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_rule_apply_log_invoice ON rule_apply_log (invoice_id, applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_rule_apply_log_version ON rule_apply_log (rule_version_id, applied_at DESC);

COMMIT;

