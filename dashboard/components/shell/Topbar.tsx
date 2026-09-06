"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, ExternalLink } from "lucide-react";
import { Brand, MobileDrawer, NAV_ITEMS } from "./Sidebar";

export function Topbar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const current = NAV_ITEMS.find((n) => pathname === n.href || pathname.startsWith(n.href + "/"));

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur lg:hidden">
        <button
          onClick={() => setOpen(true)}
          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Brand compact />
        <span className="text-sm font-medium text-slate-700">{current?.label ?? ""}</span>
        <span className="flex-1" />
        <Link href="/" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900">
          Site <ExternalLink className="h-3 w-3" />
        </Link>
      </header>
      <MobileDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
