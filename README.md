This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Supabase setup (primary database)

- Point the app at your Supabase Postgres by setting `DATABASE_URL` to the connection string from **Settings → Database → Connection string → psql** (example: `postgresql://postgres:<password>@db.<project>.supabase.co:5432/postgres?sslmode=require`). Set `PGSSL=true` if you prefer forcing SSL in code.
- Run the schema in Supabase: `npm run db:migrate` (SQL in `db/migrations`) followed by `npm run prisma:generate`. Optionally seed starter data with `npm run db:seed`.
- Master data now lives in Supabase, not NAV. You can manage vendors, G/L accounts, dimensions, and vendor rules directly in the `/database` UI or via REST endpoints:
  - Vendors: `GET/POST /api/vendors`, `PUT/DELETE /api/vendors/:id`
  - G/L accounts: `GET/POST /api/gl-accounts`, `PUT/DELETE /api/gl-accounts/:id`
  - Dimensions: `GET/POST /api/dimensions`, `PUT/DELETE /api/dimensions/:id`
  - Vendor rules: `GET/POST /api/vendor-rules`, `PUT/DELETE /api/vendor-rules/:id`
- Invoice runs (including extracted payloads and NAV previews) are stored in Supabase too; see `runs` table. The UI under `/database` now includes forms to add/edit/delete G/L accounts and dimensions without relying on NAV sync.

## NAV 2018 integration notes

- Goal: keep the extractor compatible with Microsoft Dynamics NAV 2018 (on-prem). The API should be able to push structured invoice data into NAV via OData v4 (or SOAP/codeunits).
- Likely target: create Purchase Invoices (header + lines) or write to a custom staging table/page, then let a NAV Job Queue validate/post.
- Connectivity/auth: NavUserPassword over HTTPS to the service tier (default OData port 7048). Required env vars when we wire it up: `NAV_BASE_URL`, `NAV_COMPANY`, `NAV_USER`, `NAV_PASSWORD`.
- Endpoint shape example: `https://navhost:7048/DynamicsNAV110/ODataV4/Company('MyCompany')/PurchaseInvoices` or a published custom page. Use Basic auth header and send header/lines JSON payload.
- Error handling: surface NAV errors back to the UI; consider a staging + job queue pattern to decouple posting from the extractor call.
- Development: set `NAV_USE_MOCK=true` to use the mock NAV layer (`lib/navClient.ts`, `lib/navMock.ts`, `lib/vendorTemplates.ts`) so the UI/API can build NAV journal previews without a live NAV connection.
- Posting: set `NAV_BASE_URL`, `NAV_COMPANY`, `NAV_USER`, `NAV_PASSWORD`, and optional `NAV_PURCHASE_INVOICE_PATH` (defaults to `PurchaseInvoices`). Then trigger a post with `POST /api/invoice-runs/:id/post-to-nav` or the "Send to NAV" buttons in the UI; when `NAV_USE_MOCK=true`, the payload is only logged.
- Purchase Orders: optional `NAV_PURCHASE_ORDER_PATH` (defaults to `PurchaseOrders`) is used by `lib/navClient.postPurchaseOrder`. PO CRUD/receipts UI lives under `/purchase-orders`; APIs include `/api/purchase-orders` (list/create), `/api/purchase-orders/:id` (read/update/cancel), `/api/purchase-orders/:id/lines`, `/api/purchase-orders/:id/receipts`, `/api/purchase-orders/open-lines` (available lines for matching), and `/api/invoices/:id/match-po` to tie invoice lines to PO lines and update quantities.

## Database (PostgreSQL) for NAV master data and rules

- Schema lives in `db/migrations` (the new `002_nav_master.sql` creates `vendors`, `gl_accounts`, `dimensions`, `vendor_rules`, `runs` and a `match_type` enum). UUIDs use a Postgres expression, no extensions required.
- Env vars: `DATABASE_URL` (Postgres connection string), optional `PGSSL=true` for SSL (e.g., Azure Database for PostgreSQL).
- Migrate: `npm run db:migrate` (runs all SQL files in `db/migrations`).
- Connection helper: `lib/db.ts` exposes a pooled client via `getPool`/`withClient`.
- NAV sync endpoint: POST `/api/nav-sync` to upsert vendors/G/L/dimensions from the NAV client (or mock data when `NAV_USE_MOCK=true`).
- Runs table stores each deterministic rule application: raw invoice JSON, rule matches per line, and the NAV payload used for previewing.
- Supabase note: for migrations/DDL, prefer the direct DB host (`db.<project>.supabase.co:5432`) over the pooler (`*.pooler.supabase.com:6543`) if you hit disconnects.

## AI vendor rule builder (optional)

You can generate vendor rules from natural language (then review + save) by setting:

- `OPENAI_API_KEY` (required)
- `OPENAI_MODEL_VENDOR_RULES` (optional, default `gpt-4o-mini`)

Core APIs (LLM used only at compile-time):

- `POST /api/rules/compile` with `{ vendorId, instructionText }` → `{ dsl, warnings, requiredMappings, llmTraceId }`
- `POST /api/rulesets/:vendorId/versions` with `{ dsl, activate, notes, llmTraceId }` → saves an immutable rule version (optionally activates it)
- `POST /api/invoices/:invoiceId/apply-rules` → runs deterministic engine, writes `rule_apply_log`, updates invoice lines
- `POST /api/invoices/:invoiceId/submit-for-approval` → snapshots an approval plan (or auto-approves if policy is `none`)
- `POST /api/invoices/:invoiceId/confirm-vendor` with `{ vendorId }` → confirms the vendor match (moves invoice out of `needs_review`)
- `GET/POST /api/vendor-aliases`, `PUT/DELETE /api/vendor-aliases/:id` → manage vendor aliases (used only for vendor-match suggestions)

APIs:

- `POST /api/vendor-rules/ai` with `{ vendorId, instruction }` → returns draft rules (no DB write)
- `POST /api/vendor-rules/ai` with `{ vendorId, draftRules, create: true }` → persists the draft rules

The `/database` UI includes an "AI rule builder" panel under Vendor rules.

Note: `/api/vendor-rules/*` and the "Vendor rules" UI are the legacy matcher-based rules. The versioned DSL rulesets live under `/api/rules*` and are the recommended path for deterministic, auditable automation.

## Prisma

- Schema: `prisma/schema.prisma` mirrors the SQL schema (vendors, G/L accounts, dimensions, vendor rules, runs).
- Generate client: `npm run prisma:generate` (outputs to `.prisma/client` via `@prisma/client`).
- Datasource: `DATABASE_URL` (uses SSL when `PGSSL=true` in `lib/db.ts`).

## Email invoice ingest

Mailboxes now live in the database and can be connected from the UI at `/settings/inbox`:

- OAuth buttons for Google/Workspace and Outlook/365 (IMAP scope only), plus a manual IMAP form (host/port/TLS/user/password, filters, processed mailbox).
- `MAILBOX_SECRET_KEY` (32 bytes/hex/base64 or any string) is required to encrypt stored IMAP/OAuth secrets.
- OAuth env vars (set these for the provider(s) you use):
  - Google: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` (defaults to `/api/mailboxes/oauth/google/callback`)
  - Outlook: `OUTLOOK_OAUTH_CLIENT_ID`, `OUTLOOK_OAUTH_CLIENT_SECRET`, `OUTLOOK_OAUTH_REDIRECT_URI` (defaults to `/api/mailboxes/oauth/outlook/callback`)
- APIs:
  - `GET /api/mailboxes` – list mailboxes for the signed-in firm (secrets stripped)
  - `POST /api/mailboxes` – create/update a mailbox (encrypts secret server-side)
  - `POST /api/mailboxes/:id/test` – IMAP login + attachment preview (no side effects)
  - `POST /api/mailboxes/:id/ingest` – run ingest for that mailbox
  - `POST /api/email-ingest` – runs ingest for all active mailboxes (optionally `?mailboxId=` to target one)
- Filtering is per-mailbox: allowed senders, subject keywords (default `invoice,bill,payment,statement`), PDF-only, 10MB limit, optional processed mailbox move.
- `EMAIL_INGEST_TOKEN` still protects the ingest endpoint when set.

Quick ingest test (server running locally and token set):

```bash
curl -X POST "http://localhost:3000/api/email-ingest?token=$EMAIL_INGEST_TOKEN"
```
