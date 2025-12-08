import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";

const STATE_COOKIE = "mailbox_oauth_state";

const buildStateCookie = (value: unknown) =>
  Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { provider: providerRaw } = await params;
  const provider = providerRaw.toLowerCase();
  const state = crypto.randomBytes(16).toString("hex");
  const origin = req.nextUrl.origin;

  if (provider === "google") {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI ?? `${origin}/api/mailboxes/oauth/google/callback`;
    if (!clientId) return NextResponse.json({ error: "GOOGLE_OAUTH_CLIENT_ID missing" }, { status: 500 });

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "https://mail.google.com/ https://www.googleapis.com/auth/userinfo.email");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);

    const res = NextResponse.redirect(url.toString(), { status: 302 });
    res.cookies.set({
      name: STATE_COOKIE,
      value: buildStateCookie({ state, provider, firmId: session.firmId }),
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 10 * 60,
    });
    return res;
  }

  if (provider === "outlook") {
    const clientId = process.env.OUTLOOK_OAUTH_CLIENT_ID;
    const redirectUri =
      process.env.OUTLOOK_OAUTH_REDIRECT_URI ?? `${origin}/api/mailboxes/oauth/outlook/callback`;
    if (!clientId) return NextResponse.json({ error: "OUTLOOK_OAUTH_CLIENT_ID missing" }, { status: 500 });

    const scopes =
      "offline_access https://outlook.office365.com/IMAP.AccessAsUser.All https://graph.microsoft.com/User.Read";
    const url = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", scopes);
    url.searchParams.set("state", state);

    const res = NextResponse.redirect(url.toString(), { status: 302 });
    res.cookies.set({
      name: STATE_COOKIE,
      value: buildStateCookie({ state, provider, firmId: session.firmId }),
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 10 * 60,
    });
    return res;
  }

  return NextResponse.json({ error: "Unsupported provider" }, { status: 400 });
}
