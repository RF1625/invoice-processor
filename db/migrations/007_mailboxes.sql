BEGIN;

CREATE TABLE IF NOT EXISTS mailboxes (
  id UUID PRIMARY KEY DEFAULT (md5(random()::text || clock_timestamp()::text)::uuid),
  user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  firm_id UUID NOT NULL REFERENCES firms (id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  imap_host TEXT,
  imap_port INT,
  imap_tls BOOLEAN NOT NULL DEFAULT TRUE,
  imap_user TEXT,
  encrypted_secret TEXT,
  allowed_senders TEXT,
  subject_keywords TEXT,
  source_mailbox TEXT,
  processed_mailbox TEXT,
  last_seen_uid BIGINT,
  max_messages INT NOT NULL DEFAULT 10,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mailboxes_firm ON mailboxes (firm_id);
CREATE INDEX IF NOT EXISTS idx_mailboxes_user ON mailboxes (user_id);

COMMIT;
