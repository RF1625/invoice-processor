BEGIN;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS approval_approver_id UUID REFERENCES users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_firm_approval_approver
  ON invoices (firm_id, approval_approver_id);

COMMIT;
