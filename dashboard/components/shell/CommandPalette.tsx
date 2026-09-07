"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  CalendarDays,
  CornerDownLeft,
  FileText,
  LayoutDashboard,
  Loader2,
  Search,
  Send,
  Settings2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { api, type Shift } from "@/lib/api";
import { coverage, fmtShiftWindow, humanize } from "@/lib/format";
import { Avatar, Badge, Kbd, cx } from "@/components/ui";
import { useVolunteerDirectory } from "@/components/volunteers/VolunteerDirectory";

interface Item {
  id: string;
  label: string;
  sublabel?: string;
  href: string;
  icon?: LucideIcon;
  avatarName?: string;
  group: "Go to" | "Shifts" | "Volunteers";
  badge?: string;
  keywords: string;
}

const NAV: Item[] = [
  { id: "nav-overview", label: "Overview", href: "/dashboard", icon: LayoutDashboard, group: "Go to", keywords: "dashboard home overview" },
  { id: "nav-shifts", label: "Shifts", href: "/shifts", icon: CalendarDays, group: "Go to", keywords: "shifts schedule" },
  { id: "nav-volunteers", label: "Volunteers", href: "/volunteers", icon: Users, group: "Go to", keywords: "volunteers people pool" },
  { id: "nav-comms", label: "Communications", href: "/communications", icon: Send, group: "Go to", keywords: "communications messages email sms" },
  { id: "nav-activity", label: "Agent activity", href: "/activity", icon: Activity, group: "Go to", keywords: "activity audit trail tool calls" },
  { id: "nav-reports", label: "Reports", href: "/reports", icon: FileText, group: "Go to", keywords: "reports coverage impact" },
  { id: "nav-automation", label: "Automation", href: "/automation", icon: Settings2, group: "Go to", keywords: "automation worker schedule" },
];

const Ctx = createContext<{ open: () => void } | null>(null);

/** Opens the palette from anywhere inside the app shell. */
export function useCommandPalette() {
  return useContext(Ctx) ?? { open: () => {} };
}

/**
 * Cmd/Ctrl+K (or "/") palette: jump to any page, shift or volunteer from the
 * keyboard. Mounted once in the app layout so it renders above every route and
 * is not tied to the sidebar's responsive visibility.
 */
export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { volunteers } = useVolunteerDirectory();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [shifts, setShifts] = useState<Shift[] | null>(null);
  const [loadingShifts, setLoadingShifts] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const api_open = useCallback(() => setOpen(true), []);
  const value = useMemo(() => ({ open: api_open }), [api_open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.key === "/" && !open) {
        const t = e.target as HTMLElement | null;
        const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
        if (!typing) {
          e.preventDefault();
          setOpen(true);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Load the shift list the first time the palette opens.
  useEffect(() => {
    if (!open || shifts || loadingShifts) return;
    setLoadingShifts(true);
    api
      .shifts()
      .then(setShifts)
      .catch(() => setShifts([]))
      .finally(() => setLoadingShifts(false));
  }, [open, shifts, loadingShifts]);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setActive(0);
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const shiftItems: Item[] = (shifts ?? []).map((s) => {
      const c = coverage(s);
      return {
        id: `shift-${s.id}`,
        label: s.program_name,
        sublabel: `${fmtShiftWindow(s)} · ${s.location}`,
        href: `/shifts/${encodeURIComponent(s.id)}`,
        icon: CalendarDays,
        group: "Shifts",
        badge: `${c.committed}/${c.required}`,
        keywords: `${s.program_name} ${s.location} ${s.id} ${s.required_skills.join(" ")} ${s.status}`.toLowerCase(),
      };
    });
    const volunteerItems: Item[] = volunteers.map((v) => ({
      id: `vol-${v.id}`,
      label: v.name,
      sublabel: `${v.email}${v.skills?.length ? ` · ${v.skills.slice(0, 3).map(humanize).join(", ")}` : ""}`,
      href: `/volunteers/${encodeURIComponent(v.id)}`,
      avatarName: v.name,
      group: "Volunteers",
      keywords: `${v.name} ${v.email} ${v.phone} ${v.id} ${v.skills?.join(" ")}`.toLowerCase(),
    }));
    return [...NAV, ...shiftItems, ...volunteerItems];
  }, [shifts, volunteers]);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) {
      return items.filter((i) => i.group === "Go to").concat(items.filter((i) => i.group === "Shifts").slice(0, 5));
    }
    return items
      .filter((i) => i.keywords.includes(needle) || i.label.toLowerCase().includes(needle))
      .map((i) => ({ i, score: i.label.toLowerCase().startsWith(needle) ? 0 : i.label.toLowerCase().includes(needle) ? 1 : 2 }))
      .sort((a, b) => a.score - b.score)
      .map((x) => x.i)
      .slice(0, 24);
  }, [q, items]);

  useEffect(() => setActive(0), [q]);

  const go = useCallback(
    (item: Item) => {
      setOpen(false);
      router.push(item.href);
    },
    [router],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return setOpen(false);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[active];
      if (item) go(item);
    }
  };

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  let lastGroup = "";

  return (
    <Ctx.Provider value={value}>
      {children}
      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[10vh]">
          <button aria-label="Close search" className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Search"
            className="relative w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-pop animate-fade-up"
            onKeyDown={onKeyDown}
          >
            <div className="flex items-center gap-2.5 border-b border-slate-100 px-4">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search shifts, volunteers, pages…"
                className="h-12 flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
              {loadingShifts && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-300" />}
              <span className="hidden sm:block">
                <Kbd>esc</Kbd>
              </span>
            </div>

            <div ref={listRef} className="scroll-thin max-h-[52vh] overflow-y-auto p-2">
              {results.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-slate-500">No matches for &ldquo;{q}&rdquo;.</p>
              ) : (
                results.map((item, idx) => {
                  const showGroup = item.group !== lastGroup;
                  lastGroup = item.group;
                  const Icon = item.icon;
                  return (
                    <div key={item.id}>
                      {showGroup && (
                        <p className="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 first:pt-1">
                          {item.group}
                        </p>
                      )}
                      <button
                        data-idx={idx}
                        onMouseEnter={() => setActive(idx)}
                        onClick={() => go(item)}
                        className={cx(
                          "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition",
                          idx === active ? "bg-slate-100" : "hover:bg-slate-50",
                        )}
                      >
                        {item.avatarName ? (
                          <Avatar name={item.avatarName} size="sm" />
                        ) : Icon ? (
                          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                        ) : null}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-900">{item.label}</span>
                          {item.sublabel && <span className="block truncate text-xs text-slate-500">{item.sublabel}</span>}
                        </span>
                        {item.badge && <Badge tone="neutral">{item.badge}</Badge>}
                        {idx === active && <CornerDownLeft className="hidden h-3.5 w-3.5 shrink-0 text-slate-400 sm:block" />}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="hidden items-center gap-3 border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400 sm:flex">
              <span className="inline-flex items-center gap-1">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> navigate
              </span>
              <span className="inline-flex items-center gap-1">
                <Kbd>↵</Kbd> open
              </span>
              <span className="ml-auto inline-flex items-center gap-1">
                <Kbd>⌘</Kbd>
                <Kbd>K</Kbd> anywhere
              </span>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

/** Sidebar search affordance. */
export function CommandTrigger() {
  const { open } = useCommandPalette();
  return (
    <button
      onClick={open}
      className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left text-sm text-slate-400 transition hover:border-slate-300 hover:text-slate-600"
    >
      <Search className="h-3.5 w-3.5" />
      <span className="flex-1">Search…</span>
      <Kbd>⌘K</Kbd>
    </button>
  );
}

/** Icon-only trigger for the mobile top bar. */
export function CommandTriggerIcon() {
  const { open } = useCommandPalette();
  return (
    <button onClick={open} aria-label="Search" className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100">
      <Search className="h-4.5 w-4.5" />
    </button>
  );
}
