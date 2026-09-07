"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  CalendarDays,
  FileText,
  LayoutDashboard,
  Send,
  Settings2,
  Users,
  X,
  Sparkles,
} from "lucide-react";
import { cx } from "@/components/ui";
import { BackendStatus } from "./BackendStatus";
import { CommandTrigger } from "./CommandPalette";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/shifts", label: "Shifts", icon: CalendarDays },
  { href: "/volunteers", label: "Volunteers", icon: Users },
  { href: "/communications", label: "Communications", icon: Send },
  { href: "/activity", label: "Agent activity", icon: Activity },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/automation", label: "Automation", icon: Settings2 },
];

export function Brand({ compact }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 group">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm ring-1 ring-brand-700/20">
        <Sparkles className="h-4 w-4" />
      </span>
      {!compact && (
        <span className="leading-tight">
          <span className="block text-sm font-semibold tracking-tight text-slate-900">VolunteerShift</span>
          <span className="block text-[11px] text-slate-500">Coordination agent</span>
        </span>
      )}
    </Link>
  );
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-0.5 px-3 py-3">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cx(
              "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition",
              active ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )}
          >
            <Icon className={cx("h-4 w-4", active ? "text-white" : "text-slate-400 group-hover:text-slate-600")} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white/80 backdrop-blur sticky top-0 h-screen">
      <div className="border-b border-slate-200 px-5 py-4">
        <Brand />
      </div>
      <div className="px-3 pt-3">
        <CommandTrigger />
      </div>
      <SidebarNav />
      <div className="border-t border-slate-200 p-3">
        <BackendStatus />
      </div>
    </aside>
  );
}

export function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="lg:hidden fixed inset-0 z-50">
      <button aria-label="Close menu" className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-pop flex flex-col animate-fade-up">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <Brand />
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <SidebarNav onNavigate={onClose} />
        <div className="border-t border-slate-200 p-3">
          <BackendStatus />
        </div>
      </div>
    </div>
  );
}
