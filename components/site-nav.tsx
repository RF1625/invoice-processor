"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Database, Home, Inbox, LayoutDashboard, LogIn, UploadCloud } from "lucide-react";

type NavLink = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

const links: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/", label: "Upload", icon: UploadCloud },
  { href: "/database", label: "Database", icon: Database },
  { href: "/settings/inbox", label: "Connect inbox", icon: Inbox },
  { href: "/login", label: "Login", icon: LogIn },
];

const brand = { href: "/dashboard", label: "Invoice Ops", icon: Home };

const isActive = (pathname: string, href: string) => {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
};

export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 bg-white shadow-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href={brand.href} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
          <brand.icon className="h-4 w-4 text-slate-700" />
          {brand.label}
        </Link>
        <nav className="flex items-center gap-1">
          {links.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
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
