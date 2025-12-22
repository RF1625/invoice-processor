"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CheckSquare, Database, Home, Inbox, LayoutDashboard, LogIn, LogOut, Settings, UploadCloud } from "lucide-react";
import { prefetchNavData, prefetchNavDataForHref } from "@/lib/nav-prefetch";

type NavLink = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

const baseLinks: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/approvals", label: "My approvals", icon: CheckSquare },
  { href: "/upload", label: "Upload", icon: UploadCloud },
  { href: "/database", label: "Database", icon: Database },
  { href: "/settings/inbox", label: "Connect inbox", icon: Inbox },
  { href: "/settings/approvals", label: "Approval settings", icon: Settings },
];

const brand = { href: "/dashboard", label: "Invoice Ops", icon: Home };

const isActive = (pathname: string, href: string) => {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
};

const scheduleIdle = (cb: () => void) => {
  if (typeof document === "undefined") return 0;

  const globalWithIdle = globalThis as typeof globalThis & {
    requestIdleCallback?: (fn: () => void, opts?: { timeout: number }) => number;
  };

  if (typeof globalWithIdle.requestIdleCallback === "function") {
    return globalWithIdle.requestIdleCallback(cb, { timeout: 2000 });
  }

  return setTimeout(cb, 500);
};

type IdleHandle = number | ReturnType<typeof setTimeout>;

const cancelIdle = (id: IdleHandle) => {
  if (typeof document === "undefined") return;

  const globalWithIdle = globalThis as typeof globalThis & {
    cancelIdleCallback?: (handle: number) => void;
  };

  if (typeof globalWithIdle.cancelIdleCallback === "function" && typeof id === "number") {
    globalWithIdle.cancelIdleCallback(id);
    return;
  }

  clearTimeout(id as ReturnType<typeof setTimeout>);
};

export function SiteNavClient({ isAuthenticated }: { isAuthenticated: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const shouldHideNav = pathname === "/" || pathname === "/signup" || pathname === "/login";

  const prefetchHrefs = useMemo(() => {
    const hrefs = new Set<string>([brand.href, "/login", "/signup"]);
    for (const link of baseLinks) hrefs.add(link.href);
    return [...hrefs];
  }, []);

  useEffect(() => {
    if (shouldHideNav) return;
    for (const href of prefetchHrefs) {
      try {
        router.prefetch(href);
      } catch {}
    }
  }, [prefetchHrefs, router, shouldHideNav]);

  useEffect(() => {
    if (shouldHideNav) return;
    const id = scheduleIdle(() => {
      prefetchNavData();
    });
    return () => cancelIdle(id);
  }, [shouldHideNav]);

  if (shouldHideNav) {
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

  const handlePrefetch = (href: string) => {
    try {
      router.prefetch(href);
    } catch {}
    prefetchNavDataForHref(href);
  };

  return (
    <header className="sticky top-0 z-40 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link
          href={brand.href}
          prefetch
          onPointerEnter={() => {
            handlePrefetch(brand.href);
          }}
          onFocus={() => {
            handlePrefetch(brand.href);
          }}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900"
        >
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
                onPointerEnter={() => {
                  handlePrefetch(link.href);
                }}
                onFocus={() => {
                  handlePrefetch(link.href);
                }}
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
