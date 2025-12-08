import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/secretVault";
import { getSessionFromCookies } from "@/lib/auth";
import { DEFAULT_SUBJECT_KEYWORDS } from "@/lib/mailboxIngest";

const STATE_COOKIE = "mailbox_oauth_state";

const parseStateCookie = (value: string | undefined) => {
  if (!value) return null;
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    return JSON.parse(decoded) as { state: string; provider: string };
  } catch {
    return null;
  }
};

const redirectToSettings = (req: NextRequest, query: Record<string, string>) => {
  const url = new URL("/settings/inbox", req.nextUrl.origin);
  for (const [k, v] of Object.entries(query)) {
    url.searchParams.set(k, v);
  }
  const res = NextResponse.redirect(url.toString(), { status: 302 });
  res.cookies.delete(STATE_COOKIE);
  return res;
};

const fetchGoogleTokens = async (code: string, redirectUri: string) => {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth env vars missing");

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${await res.text()}`);
  return (await res.json()) as { access_token?: string; refresh_token?: string };
};

const fetchOutlookTokens = async (code: string, redirectUri: string) => {
  const clientId = process.env.OUTLOOK_OAUTH_CLIENT_ID;
  const clientSecret = process.env.OUTLOOK_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Outlook OAuth env vars missing");

  const scopes =
    "offline_access https://outlook.office365.com/IMAP.AccessAsUser.All https://graph.microsoft.com/User.Read";
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    scope: scopes,
  });
  const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Outlook token exchange failed: ${await res.text()}`);
  return (await res.json()) as { access_token?: string; refresh_token?: string };
};

const fetchGoogleProfile = async (accessToken: string) => {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to fetch Google profile");
  const data = (await res.json()) as { email?: string };
  return data.email;
};

const fetchOutlookProfile = async (accessToken: string) => {
  const res = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to fetch Outlook profile");
  const data = (await res.json()) as { mail?: string; userPrincipalName?: string };
  return data.mail || data.userPrincipalName;
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { provider: providerRaw } = await params;
  const provider = providerRaw.toLowerCase();
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const stateCookie = parseStateCookie(req.cookies.get(STATE_COOKIE)?.value);

  if (!code || !stateParam) {
    return redirectToSettings(req, { error: "missing_code", provider });
  }

  if (!stateCookie || stateCookie.state !== stateParam || stateCookie.provider !== provider) {
    return redirectToSettings(req, { error: "invalid_state", provider });
  }

  try {
    const origin = req.nextUrl.origin;
    if (provider === "google") {
      const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI ?? `${origin}/api/mailboxes/oauth/google/callback`;
      const tokens = await fetchGoogleTokens(code, redirectUri);
      if (!tokens.access_token) throw new Error("Google returned no access token");
      if (!tokens.refresh_token) {
        console.warn("Google OAuth returned no refresh_token; will store access_token instead");
      }
      const email = await fetchGoogleProfile(tokens.access_token);
      if (!email) throw new Error("Google profile missing email");
      const secretToStore = tokens.refresh_token ?? tokens.access_token;

      const existing = await prisma.mailbox.findFirst({
        where: { firmId: session.firmId, provider, imapUser: email },
      });
      const data = {
        provider,
        firmId: session.firmId,
        userId: session.userId,
        imapHost: "imap.gmail.com",
        imapPort: 993,
        imapTls: true,
        imapUser: email,
        encryptedSecret: encryptSecret(secretToStore),
        allowedSenders: email,
        subjectKeywords: DEFAULT_SUBJECT_KEYWORDS.join(","),
        sourceMailbox: "INBOX",
        active: true,
      };
      await (existing
        ? prisma.mailbox.update({ where: { id: existing.id }, data })
        : prisma.mailbox.create({ data }));

      return redirectToSettings(req, { connected: "google" });
    }

    if (provider === "outlook") {
      const redirectUri =
        process.env.OUTLOOK_OAUTH_REDIRECT_URI ?? `${origin}/api/mailboxes/oauth/outlook/callback`;
      const tokens = await fetchOutlookTokens(code, redirectUri);
      if (!tokens.access_token) throw new Error("Outlook returned no access token");
      if (!tokens.refresh_token) {
        console.warn("Outlook OAuth returned no refresh_token; will store access_token instead");
      }
      const email = await fetchOutlookProfile(tokens.access_token);
      if (!email) throw new Error("Outlook profile missing email");
      const secretToStore = tokens.refresh_token ?? tokens.access_token;

      const existing = await prisma.mailbox.findFirst({
        where: { firmId: session.firmId, provider, imapUser: email },
      });
      const data = {
        provider,
        firmId: session.firmId,
        userId: session.userId,
        imapHost: "outlook.office365.com",
        imapPort: 993,
        imapTls: true,
        imapUser: email,
        encryptedSecret: encryptSecret(secretToStore),
        allowedSenders: email,
        subjectKeywords: DEFAULT_SUBJECT_KEYWORDS.join(","),
        sourceMailbox: "INBOX",
        active: true,
      };
      await (existing
        ? prisma.mailbox.update({ where: { id: existing.id }, data })
        : prisma.mailbox.create({ data }));

      return redirectToSettings(req, { connected: "outlook" });
    }

    return redirectToSettings(req, { error: "unsupported_provider", provider });
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth failed";
    console.error("Mailbox OAuth callback failed", err);
    return redirectToSettings(req, { error: message, provider });
  }
}
