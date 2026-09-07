import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";
import { VolunteerDirectoryProvider } from "@/components/volunteers/VolunteerDirectory";
import { CommandPaletteProvider } from "@/components/shell/CommandPalette";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <VolunteerDirectoryProvider>
      <CommandPaletteProvider>
        <div className="flex min-h-screen bg-slate-50">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar />
            <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
          </div>
        </div>
      </CommandPaletteProvider>
    </VolunteerDirectoryProvider>
  );
}
