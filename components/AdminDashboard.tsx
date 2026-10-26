"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, ArrowLeft, FileText, LoaderCircle, RefreshCw, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import BrandMark from "./BrandMark";
import LogoutButton from "./LogoutButton";
import ThemeToggle from "./ThemeToggle";

interface Analytics {
  overview: {
    totalUsers: number;
    totalDocuments: number;
    newUsersLast7Days: number;
    newDocumentsLast7Days: number;
  };
  recentUsers: Array<{ name: string; email: string; createdAt: string }>;
  signupsByDay: Array<{ day: string; value: number }>;
  documentsByDay: Array<{ day: string; value: number }>;
  generatedAt: string;
}

function ActivityChart({ title, rows, color }: { title: string; rows: Analytics["signupsByDay"]; color: string }) {
  const values = new Map(rows.map((row) => [row.day, row.value]));
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - (6 - index));
    const key = date.toISOString().slice(0, 10);
    return { key, value: values.get(key) ?? 0 };
  });
  const max = Math.max(1, ...days.map((day) => day.value));

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="font-mono text-[10px] uppercase tracking-wider text-stone-400">Last 7 days</span>
      </div>
      <div className="grid h-32 grid-cols-7 items-end gap-2">
        {days.map((day) => (
          <div key={day.key} className="flex h-full flex-col items-center justify-end gap-2">
            <span className="text-[10px] text-stone-500">{day.value || ""}</span>
            <div className="w-full rounded-t-md transition-all" style={{ height: `${Math.max(5, (day.value / max) * 76)}%`, backgroundColor: color, opacity: day.value ? 1 : 0.15 }} />
            <span className="text-[9px] text-stone-400">{new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" }).format(new Date(`${day.key}T12:00:00Z`))}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function AdminDashboard() {
  const router = useRouter();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/analytics", { cache: "no-store" });
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (response.status === 403) {
        router.replace("/workspace");
        return;
      }
      const payload = await response.json() as Analytics & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to load analytics.");
      setAnalytics(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load analytics.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { void loadAnalytics(); }, [loadAnalytics]);

  return (
    <main className="min-h-screen bg-[#f5f4ef] text-[#17251f]">
      <header className="flex min-h-[68px] flex-wrap items-center justify-between gap-y-2 border-b border-stone-300 bg-[#fbfaf6] px-4 py-2 sm:px-8">
        <Link href="/workspace" className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold sm:gap-3"><BrandMark /> EdgeNote <span className="hidden font-normal text-stone-400 sm:inline">/ Admin</span></Link>
        <div className="flex items-center gap-1 sm:gap-2">
          <ThemeToggle />
          <LogoutButton />
          <Link href="/workspace" aria-label="Workspace" title="Workspace" className="inline-flex h-9 items-center gap-1 text-xs font-semibold text-stone-600 hover:text-[#176b52] sm:gap-2"><ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">Workspace</span></Link>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[.18em] text-[#77847c]">Private operator view</p>
            <h1 className="font-display text-4xl sm:text-5xl">Workspace pulse</h1>
            <p className="mt-3 text-sm text-stone-500">Account and document activity across EdgeNote.</p>
          </div>
          <button type="button" onClick={() => void loadAnalytics()} disabled={loading} className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-lg border border-stone-300 bg-[#fbfaf6] px-3 text-xs font-semibold hover:bg-white disabled:opacity-60 sm:self-auto">
            {loading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
          </button>
        </div>

        {error && <p role="alert" className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
        {loading && !analytics ? (
          <div className="grid min-h-64 place-items-center"><LoaderCircle className="h-5 w-5 animate-spin text-[#176b52]" /></div>
        ) : analytics ? (
          <>
            <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Total accounts", value: analytics.overview.totalUsers, detail: `+${analytics.overview.newUsersLast7Days} this week`, icon: Users, tint: "bg-[#e8f0e9] text-[#27664f]" },
                { label: "Total documents", value: analytics.overview.totalDocuments, detail: `+${analytics.overview.newDocumentsLast7Days} this week`, icon: FileText, tint: "bg-[#f3ecd9] text-[#8d6a23]" },
                { label: "New accounts", value: analytics.overview.newUsersLast7Days, detail: "Last 7 days", icon: Activity, tint: "bg-[#e9edf4] text-[#496286]" },
                { label: "New documents", value: analytics.overview.newDocumentsLast7Days, detail: "Last 7 days", icon: FileText, tint: "bg-[#f1e8e4] text-[#8f5d48]" },
              ].map((stat) => (
                <article key={stat.label} className="rounded-2xl border border-stone-200 bg-white p-5">
                  <div className="flex items-center justify-between"><span className="text-xs font-medium text-stone-500">{stat.label}</span><span className={`grid h-9 w-9 place-items-center rounded-xl ${stat.tint}`}><stat.icon className="h-4 w-4" /></span></div>
                  <p className="mt-5 text-3xl font-semibold tracking-tight">{stat.value.toLocaleString()}</p>
                  <p className="mt-1 text-xs text-stone-400">{stat.detail}</p>
                </article>
              ))}
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <ActivityChart title="Account signups" rows={analytics.signupsByDay} color="#398363" />
              <ActivityChart title="Documents created" rows={analytics.documentsByDay} color="#c39337" />
            </div>

            <section className="mt-5 overflow-hidden rounded-2xl border border-stone-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 px-5 py-4 sm:px-6">
                <div><h2 className="text-sm font-semibold">Recent accounts</h2><p className="mt-1 text-xs text-stone-400">Most recently created accounts</p></div>
                <span className="font-mono text-[10px] text-stone-400">UPDATED {new Date(analytics.generatedAt).toLocaleTimeString()}</span>
              </div>
              {analytics.recentUsers.length ? (
                <div className="divide-y divide-stone-100">
                  {analytics.recentUsers.map((user) => (
                    <div key={user.email} className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6">
                      <div className="min-w-0"><p className="truncate text-sm font-medium">{user.name}</p><p className="mt-1 truncate text-xs text-stone-500">{user.email}</p></div>
                      <time className="shrink-0 text-xs text-stone-400">{new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(user.createdAt))}</time>
                    </div>
                  ))}
                </div>
              ) : <p className="px-6 py-8 text-sm text-stone-500">No accounts yet.</p>}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
