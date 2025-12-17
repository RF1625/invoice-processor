import { getSessionTokenFromCookies } from "@/lib/auth";
import { SiteNavClient } from "./site-nav-client";

export async function SiteNav() {
  const token = await getSessionTokenFromCookies();
  return <SiteNavClient isAuthenticated={Boolean(token)} />;
}
