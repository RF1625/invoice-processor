import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies, validateRequestOrigin } from "@/lib/auth";
import { ingestMailbox } from "@/lib/mailboxIngest";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const originCheck = validateRequestOrigin(_req);
  if (!originCheck.ok) {
    return NextResponse.json({ error: originCheck.error }, { status: 403 });
  }

  try {
    const { id } = await params;
    const mailbox = await prisma.mailbox.findFirst({ where: { id, firmId: session.firmId } });
    if (!mailbox) {
      return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });
    }

    let body: any = null;
    try {
      body = await _req.json();
    } catch {
      body = null;
    }
    const url = _req.nextUrl;
    const sinceDaysParam = url.searchParams.get("sinceDays");
    const maxMessagesParam = url.searchParams.get("maxMessages");
    const sinceDaysRaw = body?.sinceDays ?? (sinceDaysParam ? Number(sinceDaysParam) : undefined);
    const maxMessagesRaw = body?.maxMessages ?? body?.maxMessagesOverride ?? (maxMessagesParam ? Number(maxMessagesParam) : undefined);
    const sinceDays = Number.isFinite(sinceDaysRaw) ? Number(sinceDaysRaw) : undefined;
    const maxMessagesOverride = Number.isFinite(maxMessagesRaw) ? Number(maxMessagesRaw) : undefined;

    const result = await ingestMailbox(mailbox, { sinceDays, maxMessagesOverride });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Mailbox ingest failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
