import { NextRequest, NextResponse } from "next/server";
import { fetchMailboxesForIngest, ingestMailbox } from "@/lib/mailboxIngest";

export const runtime = "nodejs";

const requiredToken = process.env.EMAIL_INGEST_TOKEN;

export async function POST(req: NextRequest) {
  try {
    if (!requiredToken) {
      return NextResponse.json({ error: "EMAIL_INGEST_TOKEN is not configured" }, { status: 500 });
    }

    let parsedBody: any = null;
    const readBody = async () => {
      if (parsedBody !== null) return parsedBody;
      try {
        parsedBody = await req.json();
      } catch {
        parsedBody = null;
      }
      return parsedBody;
    };

    const tokenFromRequest =
      req.nextUrl.searchParams.get("token") ??
      req.headers.get("x-email-ingest-token") ??
      (await readBody())?.token;

    if (tokenFromRequest !== requiredToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let mailboxId = req.nextUrl.searchParams.get("mailboxId");
    if (!mailboxId) {
      const body = await readBody();
      mailboxId = body?.mailboxId ?? body?.id ?? null;
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
