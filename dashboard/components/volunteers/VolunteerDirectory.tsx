"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { api, type Volunteer } from "@/lib/api";
import { usePolling } from "@/lib/hooks";
import { Avatar, cx } from "@/components/ui";

interface Directory {
  volunteers: Volunteer[];
  byId: Map<string, Volunteer>;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  name: (id: string) => string;
}

const Ctx = createContext<Directory | null>(null);

/**
 * Loads the volunteer list once per app session (refreshing every minute) so
 * every page can turn a volunteer_id into a name without its own request.
 */
export function VolunteerDirectoryProvider({ children }: { children: ReactNode }) {
  const { data, loading, error, reload } = usePolling(() => api.volunteers(), 60_000);

  const value = useMemo<Directory>(() => {
    const volunteers = data ?? [];
    const byId = new Map(volunteers.map((v) => [v.id, v]));
    return {
      volunteers,
      byId,
      loading,
      error,
      reload,
      name: (id) => byId.get(id)?.name ?? id,
    };
  }, [data, loading, error, reload]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVolunteerDirectory(): Directory {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Outside the app shell (e.g. the public respond page) fall back to ids.
    return {
      volunteers: [],
      byId: new Map(),
      loading: false,
      error: null,
      reload: async () => {},
      name: (id) => id,
    };
  }
  return ctx;
}

/** Inline "avatar + name" that links to the volunteer page. */
export function VolunteerName({
  id,
  size = "sm",
  link = true,
  subtitle,
  className,
}: {
  id: string;
  size?: "sm" | "md";
  link?: boolean;
  subtitle?: ReactNode;
  className?: string;
}) {
  const { byId } = useVolunteerDirectory();
  const v = byId.get(id);
  const name = v?.name ?? id;
  const inner = (
    <span className={cx("inline-flex items-center gap-2 min-w-0", className)}>
      <Avatar name={v?.name ?? id} size={size} />
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-sm font-medium text-slate-900">{name}</span>
        {subtitle !== undefined ? (
          <span className="block truncate text-xs text-slate-500">{subtitle}</span>
        ) : v ? (
          <span className="block truncate text-xs text-slate-500">{v.email}</span>
        ) : null}
      </span>
    </span>
  );
  if (!link) return inner;
  return (
    <Link href={`/volunteers/${encodeURIComponent(id)}`} className="group hover:opacity-80">
      {inner}
    </Link>
  );
}
