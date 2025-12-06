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

## NAV 2018 integration notes

- Goal: keep the extractor compatible with Microsoft Dynamics NAV 2018 (on-prem). The API should be able to push structured invoice data into NAV via OData v4 (or SOAP/codeunits).
- Likely target: create Purchase Invoices (header + lines) or write to a custom staging table/page, then let a NAV Job Queue validate/post.
- Connectivity/auth: NavUserPassword over HTTPS to the service tier (default OData port 7048). Required env vars when we wire it up: `NAV_BASE_URL`, `NAV_COMPANY`, `NAV_USER`, `NAV_PASSWORD`.
- Endpoint shape example: `https://navhost:7048/DynamicsNAV110/ODataV4/Company('MyCompany')/PurchaseInvoices` or a published custom page. Use Basic auth header and send header/lines JSON payload.
- Error handling: surface NAV errors back to the UI; consider a staging + job queue pattern to decouple posting from the extractor call.
- Development: set `NAV_USE_MOCK=true` to use the mock NAV layer (`lib/navClient.ts`, `lib/navMock.ts`, `lib/vendorTemplates.ts`) so the UI/API can build NAV journal previews without a live NAV connection.

## Database (PostgreSQL) for NAV master data and rules

- Schema lives in `db/migrations` (the new `002_nav_master.sql` creates `vendors`, `gl_accounts`, `dimensions`, `vendor_rules`, `runs` and a `match_type` enum). UUIDs use a Postgres expression, no extensions required.
- Env vars: `DATABASE_URL` (Postgres connection string), optional `PGSSL=true` for SSL (e.g., Azure Database for PostgreSQL).
- Migrate: `npm run db:migrate` (runs all SQL files in `db/migrations`).
- Connection helper: `lib/db.ts` exposes a pooled client via `getPool`/`withClient`.
- NAV sync endpoint: POST `/api/nav-sync` to upsert vendors/G/L/dimensions from the NAV client (or mock data when `NAV_USE_MOCK=true`).
- Runs table stores each deterministic rule application: raw invoice JSON, rule matches per line, and the NAV payload used for previewing.

## Prisma

- Schema: `prisma/schema.prisma` mirrors the SQL schema (vendors, G/L accounts, dimensions, vendor rules, runs).
- Generate client: `npm run prisma:generate` (outputs to `lib/generated/prisma`).
- Datasource: `DATABASE_URL` (uses SSL when `PGSSL=true` in `lib/db.ts`).

## Email invoice ingest

There is a server-side endpoint that polls an IMAP inbox for PDF invoices and runs them through the same Azure Document Intelligence + rule engine flow as manual uploads.

- Endpoint: `POST /api/email-ingest` (optionally add `?token=YOUR_SECRET` when `EMAIL_INGEST_TOKEN` is set).
- Filtering: only messages whose sender matches `EMAIL_ALLOWED_SENDERS` (comma-separated, optional) **and** whose subject contains any `EMAIL_SUBJECT_KEYWORDS` (default: `invoice,bill,payment,statement`) are considered; attachments must be PDFs and under the 10MB limit.
- Processing: matching PDF attachments are analyzed and logged as runs; messages are marked `\Seen` and optionally moved to `EMAIL_IMAP_PROCESSED_MAILBOX`.
- Env vars:
  - `EMAIL_IMAP_HOST`, `EMAIL_IMAP_PORT` (default 993), `EMAIL_IMAP_TLS` (default true), `EMAIL_IMAP_USER`, `EMAIL_IMAP_PASSWORD`
  - `EMAIL_IMAP_MAILBOX` (default `INBOX`), `EMAIL_IMAP_PROCESSED_MAILBOX` (optional)
  - `EMAIL_ALLOWED_SENDERS` (optional comma list), `EMAIL_SUBJECT_KEYWORDS` (comma list), `EMAIL_MAX_MESSAGES` (default 10)
  - `EMAIL_INGEST_TOKEN` to require a secret token on the endpoint

Quick test (with server running on localhost and token set):

```bash
curl -X POST "http://localhost:3000/api/email-ingest?token=$EMAIL_INGEST_TOKEN"
```
