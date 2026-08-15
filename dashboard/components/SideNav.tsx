"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, CalendarDays, Users, FileText, Activity, Send, Settings2 } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/shifts", label: "Shifts", icon: CalendarDays },
  { href: "/volunteers", label: "Volunteers", icon: Users },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/activity", label: "Agent Activity", icon: Activity },
  { href: "/communications", label: "Communications", icon: Send },
  { href: "/automation", label: "Automation", icon: Settings2 },
];

export default function SideNav() {
  const pathname = usePathname();

  return (
    <aside className="w-56 bg-gray-900 text-gray-300 min-h-screen flex flex-col shrink-0">
      <div className="px-5 py-5 border-b border-gray-800">
        <h1 className="text-white font-bold text-lg">VolunteerShift</h1>
        <p className="text-xs text-gray-500">Coordination Agent</p>
      </div>
      <nav className="flex-1 py-4">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-5 py-2.5 text-sm transition ${
                active ? "bg-gray-800 text-white" : "hover:bg-gray-800/60"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}