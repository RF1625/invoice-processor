import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies, validateRequestOrigin } from "@/lib/auth";
import { summarizeMailbox } from "@/lib/mailboxIngest";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const originCheck = validateRequestOrigin(req);
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
      body = await req.json();
    } catch {
      body = null;
    }
    const sinceDaysRaw = body?.sinceDays ?? req.nextUrl.searchParams.get("sinceDays");
    const sinceDays = Number.isFinite(Number(sinceDaysRaw)) ? Number(sinceDaysRaw) : undefined;

    const summary = await summarizeMailbox(mailbox, { sinceDays });
    if (!summary.ok) {
      return NextResponse.json(summary, { status: 400 });
    }
    return NextResponse.json(summary, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Mailbox summary failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
