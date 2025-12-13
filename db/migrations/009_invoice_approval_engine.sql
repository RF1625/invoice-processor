BEGIN;

-- Continia-style approval setup + deterministic approval plans.
-- We start with a single invoice-total scope (1 chain), but the model supports
-- multiple scopes (parallel chains) later (e.g., per cost centre, exception rules).

CREATE TABLE IF NOT EXISTS approval_user_setups (
  id UUID PRIMARY KEY DEFAULT (md5(random()::text || clock_timestamp()::text)::uuid),
  firm_id UUID NOT NULL REFERENCES firms (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  approver_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  approval_limit NUMERIC(18, 2), -- NULL means unlimited
  substitute_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  substitute_from TIMESTAMPTZ,
  substitute_to TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT approval_user_setups_unique_firm_user UNIQUE (firm_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_approval_user_setups_firm ON approval_user_setups (firm_id);
CREATE INDEX IF NOT EXISTS idx_approval_user_setups_firm_approver ON approval_user_setups (firm_id, approver_user_id);

CREATE TABLE IF NOT EXISTS invoice_approval_plans (
  id UUID PRIMARY KEY DEFAULT (md5(random()::text || clock_timestamp()::text)::uuid),
  firm_id UUID NOT NULL REFERENCES firms (id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  requester_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active|completed|rejected|superseded|canceled
  superseded_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoice_approval_plans_firm_invoice ON invoice_approval_plans (firm_id, invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_approval_plans_invoice ON invoice_approval_plans (invoice_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_invoice_approval_plans_active_invoice
  ON invoice_approval_plans (invoice_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS invoice_approval_scopes (
  id UUID PRIMARY KEY DEFAULT (md5(random()::text || clock_timestamp()::text)::uuid),
  firm_id UUID NOT NULL REFERENCES firms (id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES invoice_approval_plans (id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL, -- invoice_total|dimension_owner|exception_rule
  scope_key TEXT, -- e.g., "COSTCENTER=CAPEX"
  amount NUMERIC(18, 2) NOT NULL,
  currency_code TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- active|completed|canceled
  completed_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoice_approval_scopes_plan ON invoice_approval_scopes (plan_id);
CREATE INDEX IF NOT EXISTS idx_invoice_approval_scopes_firm_invoice ON invoice_approval_scopes (firm_id, invoice_id);

CREATE TABLE IF NOT EXISTS invoice_approval_steps (
  id UUID PRIMARY KEY DEFAULT (md5(random()::text || clock_timestamp()::text)::uuid),
  firm_id UUID NOT NULL REFERENCES firms (id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  scope_id UUID NOT NULL REFERENCES invoice_approval_scopes (id) ON DELETE CASCADE,
  step_index INT NOT NULL,
  approver_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'blocked', -- blocked|pending|approved|rejected|canceled
  comment TEXT,
  acted_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  acted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT invoice_approval_steps_unique_scope_step UNIQUE (scope_id, step_index)
);
CREATE INDEX IF NOT EXISTS idx_invoice_approval_steps_scope_status ON invoice_approval_steps (scope_id, status);
CREATE INDEX IF NOT EXISTS idx_invoice_approval_steps_firm_invoice ON invoice_approval_steps (firm_id, invoice_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_invoice_approval_steps_pending_per_scope
  ON invoice_approval_steps (scope_id)
  WHERE status = 'pending';

COMMIT;

