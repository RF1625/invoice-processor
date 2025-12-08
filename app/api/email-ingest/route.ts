import { NextRequest, NextResponse } from "next/server";
import { fetchMailboxesForIngest, ingestMailbox } from "@/lib/mailboxIngest";

export const runtime = "nodejs";

const requireToken = process.env.EMAIL_INGEST_TOKEN;

export async function POST(req: NextRequest) {
  try {
    if (requireToken) {
      const token = req.nextUrl.searchParams.get("token");
      if (token !== requireToken) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    let mailboxId = req.nextUrl.searchParams.get("mailboxId");
    if (!mailboxId) {
      try {
        const body = await req.json();
        mailboxId = body?.mailboxId ?? body?.id ?? null;
      } catch {
        // No JSON body supplied; proceed with defaults
      }
    }

    const mailboxes = await fetchMailboxesForIngest(mailboxId);
    if (!mailboxes.length) {
      return NextResponse.json({ error: "No active mailboxes found" }, { status: 404 });
    }

    const results: Array<Record<string, unknown>> = [];

    for (const mailbox of mailboxes) {
      try {
        const result = await ingestMailbox(mailbox);
        results.push(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Mailbox ingest failed";
        results.push({ mailboxId: mailbox.id, error: message });
      }
    }

    const processedCount = results.filter((r) => !(r as { error?: string }).error).length;

    return NextResponse.json({ processedMailboxes: results, processedCount }, { status: 200 });
  } catch (err) {
    console.error("Email ingest failed", err);
    return NextResponse.json(
      { error: "Email ingest failed", details: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
