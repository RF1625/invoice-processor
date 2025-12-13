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

    const summary = await summarizeMailbox(mailbox, { sinceDays: 7 });
    if (!summary.ok) {
      return NextResponse.json(summary, { status: 400 });
    }

    if (summary.latestUid == null) {
      return NextResponse.json(
        { ok: true, message: "No messages found; checkpoint unchanged", lastSeenUid: mailbox.lastSeenUid },
        { status: 200 },
      );
    }

    const updated = await prisma.mailbox.update({
      where: { id: mailbox.id },
      data: { lastSeenUid: BigInt(summary.latestUid), lastRunAt: new Date() },
    });

    return NextResponse.json(
      { ok: true, mailboxId: mailbox.id, lastSeenUid: updated.lastSeenUid != null ? Number(updated.lastSeenUid) : null },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to checkpoint mailbox";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
