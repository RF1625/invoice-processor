"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Database, Home, Inbox, LayoutDashboard, LogIn, LogOut, UploadCloud } from "lucide-react";

type NavLink = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

const baseLinks: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/upload", label: "Upload", icon: UploadCloud },
  { href: "/database", label: "Database", icon: Database },
  { href: "/settings/inbox", label: "Connect inbox", icon: Inbox },
];

const brand = { href: "/dashboard", label: "Invoice Ops", icon: Home };
const navTargets = [brand.href, ...baseLinks.map((link) => link.href), "/login"];

const isActive = (pathname: string, href: string) => {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
};

export function SiteNavClient({ isAuthenticated }: { isAuthenticated: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    navTargets.forEach((href) => router.prefetch(href));
  }, [router]);

  if (pathname === "/" || pathname === "/signup" || pathname === "/login") {
    return null;
  }

  const links: NavLink[] = [
    ...baseLinks,
    isAuthenticated
      ? { href: "/logout", label: "Log out", icon: LogOut }
      : { href: "/login", label: "Login", icon: LogIn },
  ];

  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) throw new Error("Logout failed");
    } catch (err) {
      console.error("Logout failed", err);
    } finally {
      router.push("/login");
      router.refresh();
      setLoggingOut(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link prefetch href={brand.href} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
          <brand.icon className="h-4 w-4 text-slate-700" />
          {brand.label}
        </Link>
        <nav className="flex items-center gap-1">
          {links.map((link) => {
            const active = isActive(pathname, link.href);
            const isLogout = isAuthenticated && link.href === "/logout";

            return isLogout ? (
              <button
                key="logout"
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                } ${loggingOut ? "opacity-70" : ""}`}
              >
                <link.icon className="h-4 w-4" />
                {loggingOut ? "Logging out…" : link.label}
              </button>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                prefetch
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <link.icon className="h-4 w-4" />
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
