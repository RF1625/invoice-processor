import { getSessionFromCookies } from "@/lib/auth";
import { SiteNavClient } from "./site-nav-client";

export async function SiteNav() {
  const session = await getSessionFromCookies();
  return <SiteNavClient isAuthenticated={Boolean(session)} />;
}
