import { CtaButton } from "@/components/cta-button";

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-12 px-6 py-16">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Invoice Automation</p>
            <h1 className="mt-2 text-4xl font-semibold text-slate-900">Process invoices straight from email.</h1>
            <p className="mt-3 max-w-xl text-sm text-slate-600">
              Securely ingest PDFs from your inbox, apply coding rules, validate G/L & dimensions, and post to NAV when ready.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <CtaButton href="/signup">Sign up</CtaButton>
            <CtaButton href="/login" variant="secondary">
              Log in
            </CtaButton>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <FeatureCard title="Email ingest" body="Connect an inbox; PDFs are filtered, checksummed, and queued without losing messages." />
          <FeatureCard title="Rules + validation" body="Line coding with required G/L/dim checks so nothing un-mapped reaches NAV." />
          <FeatureCard title="NAV-ready" body="Review payloads, validate, and post to NAV with retries and per-firm config." />
        </section>

        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-6">
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-slate-900">Ready to automate your invoices?</h2>
            <p className="text-sm text-slate-600">
              Create your workspace to start ingesting invoices. You can invite teammates after you sign up.
            </p>
          </div>
          <CtaButton href="/signup" className="bg-emerald-500 text-white hover:bg-emerald-400">
            Get started
          </CtaButton>
        </div>
      </div>
    </main>
  );
}

function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm text-slate-600">{body}</p>
    </div>
  );
}
