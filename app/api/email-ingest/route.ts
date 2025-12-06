import { NextRequest, NextResponse } from "next/server";
import { ImapFlow, type FetchMessageObject, type MessageStructureObject } from "imapflow";
import { analyzeInvoiceBuffer, MAX_INVOICE_FILE_BYTES } from "@/lib/invoiceAnalyzer";

export const runtime = "nodejs";

type Attachment = { part: string; filename: string; size?: number };

const parseList = (value: string | undefined | null, fallback: string[] = []) => {
  const parsed = (value ?? "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  return parsed.length ? parsed : fallback;
};

const allowedSenders = parseList(process.env.EMAIL_ALLOWED_SENDERS);
const subjectKeywords = parseList(process.env.EMAIL_SUBJECT_KEYWORDS, ["invoice", "bill", "payment", "statement"]);
const mailboxName = process.env.EMAIL_IMAP_MAILBOX ?? "INBOX";
const processedMailbox = process.env.EMAIL_IMAP_PROCESSED_MAILBOX;
const maxMessagesValue = Number(process.env.EMAIL_MAX_MESSAGES ?? 10);
const maxMessages = Number.isFinite(maxMessagesValue) ? maxMessagesValue : 10;
const requireToken = process.env.EMAIL_INGEST_TOKEN;

const normalizeAddresses = (envelope?: FetchMessageObject["envelope"]) => {
  const fromList = envelope?.from ?? [];
  return fromList
    .map((addr) => {
      if (typeof addr === "string") return addr.toLowerCase();
      const address = "address" in addr ? addr.address : `${addr.mailbox}@${addr.host}`;
      return address?.toLowerCase();
    })
    .filter(Boolean) as string[];
};

const subjectMatches = (subject: string) =>
  subjectKeywords.length === 0 || subjectKeywords.some((kw) => subject.includes(kw));

const shouldProcessMessage = (message: FetchMessageObject) => {
  const subject = (message.envelope?.subject ?? "").toLowerCase();
  const fromAddresses = normalizeAddresses(message.envelope);

  const senderAllowed =
    allowedSenders.length === 0 || fromAddresses.some((addr) => allowedSenders.includes(addr));

  return senderAllowed && subjectMatches(subject);
};

const collectPdfAttachments = (node: MessageStructureObject | undefined): Attachment[] => {
  const results: Attachment[] = [];
  const visit = (part: MessageStructureObject | undefined) => {
    if (!part) return;
    const disposition = (part.disposition ?? "").toLowerCase();
    const filename = part.dispositionParameters?.filename || part.parameters?.name || part.id || `attachment-${part.part}.pdf`;
    const isPdfType =
      part.type?.toLowerCase() === "application" && part.subtype?.toLowerCase() === "pdf";
    const isPdfName = typeof filename === "string" && filename.toLowerCase().endsWith(".pdf");
    if (disposition === "attachment" && (isPdfType || isPdfName)) {
      results.push({ part: part.part, filename, size: part.size });
    }
    for (const child of part.childNodes ?? []) {
      visit(child);
    }
  };
  visit(node);
  return results;
};

const downloadAttachment = async (client: ImapFlow, uid: string | number, attachment: Attachment) => {
  const { content } = await client.download(uid, attachment.part);
  const chunks: Buffer[] = [];
  for await (const chunk of content) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
};

export async function POST(req: NextRequest) {
  let client: ImapFlow | null = null;
  try {
    if (!process.env.EMAIL_IMAP_HOST || !process.env.EMAIL_IMAP_USER || !process.env.EMAIL_IMAP_PASSWORD) {
      return NextResponse.json(
        { error: "Missing EMAIL_IMAP_HOST/USER/PASSWORD env vars" },
        { status: 500 },
      );
    }

    if (requireToken) {
      const token = req.nextUrl.searchParams.get("token");
      if (token !== requireToken) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    client = new ImapFlow({
      host: process.env.EMAIL_IMAP_HOST,
      port: Number(process.env.EMAIL_IMAP_PORT ?? 993),
      secure: process.env.EMAIL_IMAP_TLS !== "false",
      auth: {
        user: process.env.EMAIL_IMAP_USER,
        pass: process.env.EMAIL_IMAP_PASSWORD,
      },
    });

    await client.connect();
    await client.mailboxOpen(mailboxName);

    const processed: Array<{ uid: number; subject: string; fileName: string; invoiceId: string | null }> = [];
    const skipped: Array<{ uid: number; subject: string; reason: string }> = [];
    let handled = 0;

    for await (const message of client.fetch({ seen: false }, { envelope: true, bodyStructure: true })) {
      if (handled >= maxMessages) break;
      handled += 1;

      const subject = message.envelope?.subject ?? "";
      if (!shouldProcessMessage(message)) {
        skipped.push({ uid: Number(message.uid), subject, reason: "Filtered by sender/subject" });
        await client.messageFlagsAdd(message.uid, ["\\Seen"]);
        continue;
      }

      const attachments = collectPdfAttachments(message.bodyStructure);
      if (attachments.length === 0) {
        skipped.push({ uid: Number(message.uid), subject, reason: "No PDF attachments" });
        await client.messageFlagsAdd(message.uid, ["\\Seen"]);
        continue;
      }

      for (const attachment of attachments) {
        if (attachment.size && attachment.size > MAX_INVOICE_FILE_BYTES) {
          skipped.push({
            uid: Number(message.uid),
            subject,
            reason: `Attachment too large (${attachment.size} bytes)`,
          });
          continue;
        }

        try {
          const buffer = await downloadAttachment(client, message.uid, attachment);
          const { processedInvoice } = await analyzeInvoiceBuffer(buffer, {
            fileName: attachment.filename,
          });

          processed.push({
            uid: Number(message.uid),
            subject,
            fileName: attachment.filename,
            invoiceId: processedInvoice.invoiceId ?? null,
          });
        } catch (err) {
          const messageText = err instanceof Error ? err.message : "Failed to process attachment";
          skipped.push({ uid: Number(message.uid), subject, reason: messageText });
        }
      }

      await client.messageFlagsAdd(message.uid, ["\\Seen"]);
      if (processedMailbox) {
        try {
          await client.messageMove(message.uid, processedMailbox);
        } catch (err) {
          console.warn("Failed to move message after processing", err);
        }
      }
    }

    await client.logout();
    client = null;

    return NextResponse.json(
      {
        mailbox: mailboxName,
        processedCount: processed.length,
        processed,
        skipped,
        maxMessages,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("Email ingest failed", err);
    return NextResponse.json(
      { error: "Email ingest failed", details: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  } finally {
    // Ensure the connection is closed if we bailed early.
    if (client) {
      try {
        await client.logout();
      } catch (err) {
        if (err) {
          console.warn("IMAP logout cleanup failed", err);
        }
      }
    }
  }
}
