import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { encryptSecret } from "@/lib/secretVault";
import { sanitizeMailbox } from "@/lib/mailboxIngest";

const providerDefaults: Record<string, { host?: string; port?: number; tls?: boolean }> = {
  gmail: { host: "imap.gmail.com", port: 993, tls: true },
  outlook: { host: "outlook.office365.com", port: 993, tls: true },
};

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mailboxes = await prisma.mailbox.findMany({
    where: { firmId: session.firmId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ mailboxes: mailboxes.map(sanitizeMailbox) });
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      id,
      provider,
      imapHost,
      imapPort,
      imapTls,
      imapUser,
      secret,
      allowedSenders,
      subjectKeywords,
      sourceMailbox,
      processedMailbox,
      maxMessages,
      active,
    } = body ?? {};

    const parsedPort = typeof imapPort === "string" ? Number(imapPort) : imapPort;
    const parsedMax = typeof maxMessages === "string" ? Number(maxMessages) : maxMessages;
    const parsedTls = typeof imapTls === "string" ? imapTls !== "false" : imapTls;

    const providerValue = typeof provider === "string" ? provider.toLowerCase() : provider;

    if (!providerValue) {
      return NextResponse.json({ error: "Provider is required" }, { status: 400 });
    }

    const defaults = providerDefaults[providerValue] ?? {};
    const data: Prisma.MailboxUncheckedUpdateInput & Prisma.MailboxUncheckedCreateInput = {
      provider: providerValue,
      firmId: session.firmId,
      userId: session.userId ?? null,
    };

    if (imapHost !== undefined || defaults.host) data.imapHost = imapHost ?? defaults.host ?? null;
    if (parsedPort !== undefined || defaults.port) data.imapPort = parsedPort ?? defaults.port ?? null;
    if (parsedTls !== undefined || defaults.tls !== undefined) data.imapTls = parsedTls ?? defaults.tls ?? true;
    if (imapUser !== undefined) data.imapUser = imapUser ?? null;
    if (allowedSenders !== undefined) data.allowedSenders = allowedSenders ?? null;
    if (subjectKeywords !== undefined) data.subjectKeywords = subjectKeywords ?? null;
    if (sourceMailbox !== undefined || !id) data.sourceMailbox = sourceMailbox ?? "INBOX";
    if (processedMailbox !== undefined) data.processedMailbox = processedMailbox ?? null;
    if (maxMessages !== undefined) {
      data.maxMessages = Number.isFinite(parsedMax) ? Number(parsedMax) : null;
    }
    if (typeof active === "boolean") {
      data.active = active;
    } else if (!id) {
      data.active = true;
    }
    if (secret) {
      data.encryptedSecret = encryptSecret(secret);
    }

    const mailbox = id
      ? await prisma.mailbox.update({
          where: { id, firmId: session.firmId },
          data,
        })
      : await prisma.mailbox.create({ data });

    return NextResponse.json({ mailbox: sanitizeMailbox(mailbox) }, { status: id ? 200 : 201 });
  } catch (err) {
    console.error("Failed to upsert mailbox", err);
    const message = err instanceof Error ? err.message : "Failed to save mailbox";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
