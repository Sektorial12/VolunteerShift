import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-card">
        <Compass className="h-5 w-5" />
      </span>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">Nothing scheduled here</h1>
      <p className="mt-1 max-w-sm text-sm text-slate-500">The page you asked for does not exist. The dashboard and the audit trail are one click away.</p>
      <div className="mt-6 flex gap-2">
        <Link href="/dashboard" className="inline-flex h-9 items-center rounded-lg bg-slate-900 px-3.5 text-sm font-medium text-white hover:bg-slate-800">
          Dashboard
        </Link>
        <Link href="/" className="inline-flex h-9 items-center rounded-lg bg-white px-3.5 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50">
          Home
        </Link>
      </div>
    </div>
  );
}
