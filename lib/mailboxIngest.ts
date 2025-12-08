import { ImapFlow, type FetchMessageObject, type MessageAddressObject, type MessageStructureObject } from "imapflow";
import crypto from "node:crypto";
import { analyzeInvoiceBuffer, MAX_INVOICE_FILE_BYTES } from "./invoiceAnalyzer";
import { prisma } from "./prisma";
import { decryptSecret } from "./secretVault";

type Attachment = { part: string; filename: string; size?: number };

export const DEFAULT_SUBJECT_KEYWORDS = ["invoice", "bill", "payment", "statement"];
export const DEFAULT_MAX_MESSAGES = 10;

const parseList = (value: string | undefined | null, fallback: string[] = []) => {
  const parsed = (value ?? "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  return parsed.length ? parsed : fallback;
};

type DetailedAddress = MessageAddressObject & { mailbox?: string; host?: string };
type DetailedStructure = MessageStructureObject & { subtype?: string };

const normalizeAddresses = (envelope?: FetchMessageObject["envelope"]) => {
  const fromList: DetailedAddress[] = (envelope?.from ?? []) as DetailedAddress[];

  return fromList
    .map((addr) => {
      const address =
        addr.address ?? (addr.mailbox && addr.host ? `${addr.mailbox}@${addr.host}` : undefined);
      return address?.toLowerCase();
    })
    .filter((addr): addr is string => Boolean(addr));
};

const subjectMatches = (keywords: string[], subject: string) =>
  keywords.length === 0 || keywords.some((kw) => subject.includes(kw));

const collectPdfAttachments = (node: DetailedStructure | undefined): Attachment[] => {
  const results: Attachment[] = [];
  const visit = (part: DetailedStructure | undefined) => {
    if (!part) return;
    const disposition = (part.disposition ?? "").toLowerCase();
    const filename =
      part.dispositionParameters?.filename || part.parameters?.name || part.id || `attachment-${part.part}.pdf`;
    const isPdfType =
      part.type?.toLowerCase() === "application" && part.subtype?.toLowerCase() === "pdf";
    const isPdfName = typeof filename === "string" && filename.toLowerCase().endsWith(".pdf");
    if (disposition === "attachment" && (isPdfType || isPdfName) && part.part) {
      const safeFilename = typeof filename === "string" ? filename : `attachment-${part.part}.pdf`;
      results.push({ part: part.part, filename: safeFilename, size: part.size });
    }
    for (const child of part.childNodes ?? []) {
      visit(child as DetailedStructure);
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

const providerDefaults = {
  gmail: { host: "imap.gmail.com", port: 993, secure: true },
  outlook: { host: "outlook.office365.com", port: 993, secure: true },
};

const getAccessToken = async (provider: string, refreshToken: string) => {
  if (provider === "gmail") {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error("Missing Google OAuth env vars");
    }
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google token refresh failed: ${text}`);
    }
    const data = (await res.json()) as { access_token?: string };
    if (!data.access_token) {
      throw new Error("Google token refresh returned no access token");
    }
    return data.access_token;
  }

  if (provider === "outlook") {
    const clientId = process.env.OUTLOOK_OAUTH_CLIENT_ID;
    const clientSecret = process.env.OUTLOOK_OAUTH_CLIENT_SECRET;
    const redirectUri = process.env.OUTLOOK_OAUTH_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error("Missing Outlook OAuth env vars");
    }
    const scopes =
      "offline_access https://outlook.office365.com/IMAP.AccessAsUser.All https://graph.microsoft.com/User.Read";
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: scopes,
    });
    const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Outlook token refresh failed: ${text}`);
    }
    const data = (await res.json()) as { access_token?: string };
    if (!data.access_token) {
      throw new Error("Outlook token refresh returned no access token");
    }
    return data.access_token;
  }

  throw new Error(`Unsupported OAuth provider: ${provider}`);
};

const buildImapClient = async (mailbox: { provider: string; imapHost?: string | null; imapPort?: number | null; imapTls?: boolean | null; imapUser?: string | null; encryptedSecret?: string | null }) => {
  const secret = decryptSecret(mailbox.encryptedSecret);
  if (!secret) {
    throw new Error("Mailbox is missing credentials");
  }

  const defaults = providerDefaults[mailbox.provider as keyof typeof providerDefaults];
  const host = mailbox.imapHost ?? defaults?.host;
  const port = mailbox.imapPort ?? defaults?.port ?? 993;
  const secure = mailbox.imapTls !== false;

  if (!host) throw new Error("Mailbox IMAP host not configured");
  if (!mailbox.imapUser) throw new Error("Mailbox IMAP username not configured");

  let auth: { user: string; pass?: string; accessToken?: string };
  if (mailbox.provider === "imap") {
    auth = { user: mailbox.imapUser, pass: secret };
  } else {
    let accessToken: string;
    try {
      accessToken = await getAccessToken(mailbox.provider, secret);
    } catch (err) {
      // If no refresh token was provided, fall back to treating the stored secret as an access token.
      if (secret.length > 0) {
        console.warn(`Falling back to stored access token for provider ${mailbox.provider}`);
        accessToken = secret;
      } else {
        throw err;
      }
    }
    auth = { user: mailbox.imapUser, accessToken };
  }

  return new ImapFlow({
    host,
    port,
    secure,
    auth,
  });
};

export type MailboxRecord = NonNullable<Awaited<ReturnType<typeof prisma.mailbox.findFirst>>>;

export const sanitizeMailbox = (mailbox: MailboxRecord | null) => {
  if (!mailbox) return null;
  // Strip secrets before returning to clients
  const { encryptedSecret, lastSeenUid, ...rest } = mailbox;
  return {
    ...rest,
    lastSeenUid: lastSeenUid != null ? Number(lastSeenUid) : null,
    hasSecret: Boolean(encryptedSecret),
  };
};

const shouldProcessMessage = (allowedSenders: string[], keywords: string[], message: FetchMessageObject) => {
  const subject = (message.envelope?.subject ?? "").toLowerCase();
  const fromAddresses = normalizeAddresses(message.envelope);

  const senderAllowed = allowedSenders.length === 0 || fromAddresses.some((addr) => allowedSenders.includes(addr));

  return senderAllowed && subjectMatches(keywords, subject);
};

export async function testMailboxConnection(mailbox: MailboxRecord) {
  const client = await buildImapClient(mailbox);
  try {
    const mailboxName = mailbox.sourceMailbox || "INBOX";
    await client.connect();
    await client.mailboxOpen(mailboxName);

    const previews: Array<{
      uid: number;
      subject: string;
      from: string[];
      pdfAttachments: Array<{ filename: string; size?: number }>;
    }> = [];

    let seen = 0;
    for await (const message of client.fetch({ seen: false }, { envelope: true, bodyStructure: true })) {
      const pdfAttachments = collectPdfAttachments(message.bodyStructure).map((att) => ({
        filename: att.filename,
        size: att.size,
      }));
      previews.push({
        uid: Number(message.uid),
        subject: message.envelope?.subject ?? "",
        from: normalizeAddresses(message.envelope),
        pdfAttachments,
      });
      seen += 1;
      if (seen >= 2) break;
    }

    await client.logout();
    return { ok: true, mailboxId: mailbox.id, previews };
  } catch (err) {
    try {
      await client.logout();
    } catch (logoutErr) {
      console.warn("Failed to logout after test", logoutErr);
    }
    const message = err instanceof Error ? err.message : "Mailbox connection failed";
    return { ok: false, mailboxId: mailbox.id, error: message };
  }
}

export async function ingestMailbox(mailbox: MailboxRecord) {
  const client = await buildImapClient(mailbox);
  const allowedSenders = parseList(mailbox.allowedSenders);
  const subjectKeywords = parseList(mailbox.subjectKeywords, DEFAULT_SUBJECT_KEYWORDS);
  const sourceMailbox = mailbox.sourceMailbox || "INBOX";
  const processedMailbox = mailbox.processedMailbox || undefined;
  const maxMessages = mailbox.maxMessages && Number.isFinite(mailbox.maxMessages) ? mailbox.maxMessages : DEFAULT_MAX_MESSAGES;
  const startUid = mailbox.lastSeenUid ? Number(mailbox.lastSeenUid) + 1 : null;
  const processed: Array<{ uid: number; subject: string; fileName: string; invoiceId: string | null }> = [];
  const skipped: Array<{ uid: number; subject: string; reason: string }> = [];
  let handled = 0;
  let lastSeenUid = mailbox.lastSeenUid ? Number(mailbox.lastSeenUid) : 0;

  try {
    await client.connect();
    await client.mailboxOpen(sourceMailbox);

    const search: Record<string, unknown> = { seen: false };
    if (startUid) search.uid = `${startUid}:*`;

    for await (const message of client.fetch(search, { envelope: true, bodyStructure: true })) {
      if (handled >= maxMessages) break;
      handled += 1;
      lastSeenUid = Math.max(lastSeenUid, Number(message.uid));

      const subject = message.envelope?.subject ?? "";
      if (!shouldProcessMessage(allowedSenders, subjectKeywords, message)) {
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
          const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
          const storagePath = `email-ingest/${sourceMailbox}/${message.uid}-${attachment.filename}`;
          const { processedInvoice } = await analyzeInvoiceBuffer(buffer, {
            fileName: attachment.filename,
            firmId: mailbox.firmId,
            fileMeta: {
              fileName: attachment.filename,
              storagePath,
              sizeBytes: buffer.byteLength,
              contentType: "application/pdf",
              checksum,
            },
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
  } catch (err) {
    try {
      await client.logout();
    } catch (logoutErr) {
      if (logoutErr) console.warn("IMAP logout cleanup failed", logoutErr);
    }
    throw err;
  } finally {
    await prisma.mailbox.update({
      where: { id: mailbox.id },
      data: {
        lastRunAt: new Date(),
        lastSeenUid: lastSeenUid ? BigInt(lastSeenUid) : mailbox.lastSeenUid,
      },
    });
  }

  return {
    mailboxId: mailbox.id,
    mailboxProvider: mailbox.provider,
    processedCount: processed.length,
    processed,
    skipped,
    maxMessages,
    lastSeenUid,
  };
}

export async function fetchMailboxesForIngest(mailboxId?: string | null) {
  const where = mailboxId ? { id: mailboxId } : { active: true };
  return prisma.mailbox.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
}
