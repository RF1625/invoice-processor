import Link from "next/link";
import { cn } from "@/lib/utils";

type CTAProps = {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  className?: string;
};

export function CtaButton({ href, children, variant = "primary", className }: CTAProps) {
  const base =
    "inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold transition shadow-md";
  const styles =
    variant === "primary"
      ? "bg-slate-900 text-white hover:bg-slate-800"
      : "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50";
  return (
    <Link href={href} className={cn(base, styles, className)}>
      {children}
    </Link>
  );
}
