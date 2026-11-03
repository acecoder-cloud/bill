"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useProfile } from "./profile-context";

const icon = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);

const ITEMS = [
  { href: "/", label: "Home", icon: icon(<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />) },
  { href: "/entries", label: "Bills", icon: icon(<><path d="M6 2h12v20l-3-2-3 2-3-2-3 2z" /><path d="M9 7h6M9 11h6M9 15h4" /></>) },
  { href: "/summary", label: "Summary", icon: icon(<><path d="M3 3h18v18H3z" /><path d="M3 9h18M3 15h18M9 3v18" /></>) },
  { href: "/reports", label: "Reports", icon: icon(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M12 18v-6M9 15l3 3 3-3" /></>) },
  { href: "/admin", label: "Admin", admin: true, icon: icon(<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>) },
];

export function BottomNav() {
  const pathname = usePathname();
  const { profile } = useProfile();
  const items = ITEMS.filter((i) => !i.admin || profile.role === "admin");
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur print:hidden">
      <ul className="mx-auto flex max-w-3xl">
        {items.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium ${active ? "text-brand-700" : "text-slate-500"}`}
                aria-current={active ? "page" : undefined}
              >
                {item.icon}
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function PageHeader({ title, back, actions }: { title: string; back?: string; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      {back && (
        <Link href={back} className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-slate-600 active:bg-slate-200" aria-label="Back">
          {icon(<path d="M15 18l-6-6 6-6" />)}
        </Link>
      )}
      <h1 className="flex-1 text-xl font-bold text-slate-900">{title}</h1>
      {actions}
    </div>
  );
}
