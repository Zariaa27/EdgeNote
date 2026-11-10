"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Download, LoaderCircle, Mail, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import BrandMark from "./BrandMark";
import LogoutButton from "./LogoutButton";
import ThemeToggle from "./ThemeToggle";

interface AccountData {
  name: string;
  email: string;
  emailVerifiedAt: string | null;
  createdAt: string;
}

export default function AccountSettings() {
  const router = useRouter();
  const [account, setAccount] = useState<AccountData | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/account", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { user?: AccountData; error?: string };
        if (response.status === 401) {
          router.replace("/login");
          return;
        }
        if (!response.ok || !payload.user) throw new Error(payload.error ?? "Unable to load account settings.");
        if (active) {
          setAccount(payload.user);
          setName(payload.user.name);
          setEmail(payload.user.email);
        }
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load account settings.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [router]);

  const updateAccount = async (event: FormEvent<HTMLFormElement>, field: "name" | "email") => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: field === "name" ? name : email, currentPassword }),
      });
      const payload = await response.json() as { message?: string; error?: string; name?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to update account settings.");
      setMessage(payload.message ?? "Account settings updated.");
      if (field === "name" && payload.name && account) setAccount({ ...account, name: payload.name });
      setCurrentPassword("");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update account settings.");
    } finally {
      setSaving(false);
    }
  };

  const deleteAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!window.confirm("Permanently delete your EdgeNote account, documents, and uploaded files? This cannot be undone.")) return;
    setDeleting(true);
    setError("");
    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: deletePassword, confirmation: deleteConfirmation }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to delete account.");
      window.location.assign("/");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete account.");
      setDeleting(false);
    }
  };

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#f5f4ef]"><LoaderCircle className="h-5 w-5 animate-spin text-[#176b52]" /></main>;

  return (
    <main className="min-h-screen bg-[#f5f4ef] text-[#17251f]">
      <header className="flex min-h-[68px] flex-wrap items-center justify-between gap-y-2 border-b border-stone-300 bg-[#fbfaf6] px-4 py-2 sm:px-8">
        <Link href="/workspace" className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold sm:gap-3"><BrandMark /> EdgeNote <span className="hidden font-normal text-stone-400 sm:inline">/ Settings</span></Link>
        <div className="flex items-center gap-1 sm:gap-2">
          <ThemeToggle />
          <LogoutButton />
          <Link href="/workspace" aria-label="Workspace" title="Workspace" className="inline-flex h-9 items-center gap-1 text-xs font-semibold text-stone-600 hover:text-[#176b52] sm:gap-2"><ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">Workspace</span></Link>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-5 py-9 sm:px-8 sm:py-14">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[.18em] text-[#77847c]">Your account</p>
        <h1 className="font-display text-4xl sm:text-5xl">Settings</h1>
        <p className="mt-3 text-sm text-stone-500">Manage your profile, security, and personal data.</p>

        {error && <p role="alert" className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
        {message && <p role="status" className="mt-6 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"><Check className="h-4 w-4" />{message}</p>}

        {account && (
          <div className="mt-8 space-y-5">
            <section className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-7">
              <div className="mb-6 flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e8f0e9] text-[#27664f]"><UserRound className="h-5 w-5" /></span><div><h2 className="text-sm font-semibold">Profile</h2><p className="mt-1 text-xs text-stone-500">Update the name shown in your workspace.</p></div></div>
              <form onSubmit={(event) => void updateAccount(event, "name")} className="space-y-4">
                <label className="block text-xs font-semibold text-stone-700">Display name<input required maxLength={80} value={name} onChange={(event) => setName(event.currentTarget.value)} className="mt-2 h-11 w-full rounded-lg border border-stone-300 px-3 text-sm font-normal outline-none focus:border-[#176b52]" /></label>
                <label className="block text-xs font-semibold text-stone-700">Current password<input required type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.currentTarget.value)} className="mt-2 h-11 w-full rounded-lg border border-stone-300 px-3 text-sm font-normal outline-none focus:border-[#176b52]" /></label>
                <button disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#176b52] px-4 text-xs font-semibold text-white hover:bg-[#12543f] disabled:opacity-60">{saving && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}Save name</button>
              </form>
            </section>

            <section className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-7">
              <div className="mb-6 flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f3ecd9] text-[#8d6a23]"><Mail className="h-5 w-5" /></span><div><h2 className="text-sm font-semibold">Email and verification</h2><p className="mt-1 text-xs text-stone-500">A verified email is required to sign in and recover your password.</p></div></div>
              <p className="mb-4 flex items-center gap-2 text-sm text-stone-700"><span>{account.email}</span>{account.emailVerifiedAt ? <span className="inline-flex items-center gap-1 rounded-full bg-[#e8f0e9] px-2 py-1 text-[10px] font-semibold text-[#27664f]"><ShieldCheck className="h-3 w-3" /> Verified</span> : <span className="text-xs text-amber-700">Not verified</span>}</p>
              <form onSubmit={(event) => void updateAccount(event, "email")} className="space-y-4">
                <label className="block text-xs font-semibold text-stone-700">New email address<input type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.currentTarget.value)} className="mt-2 h-11 w-full rounded-lg border border-stone-300 px-3 text-sm font-normal outline-none focus:border-[#176b52]" /></label>
                <label className="block text-xs font-semibold text-stone-700">Current password<input required type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.currentTarget.value)} className="mt-2 h-11 w-full rounded-lg border border-stone-300 px-3 text-sm font-normal outline-none focus:border-[#176b52]" /></label>
                <button disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-lg border border-stone-300 px-4 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-60">{saving && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}Send confirmation email</button>
              </form>
              {!account.emailVerifiedAt && <Link href="/verify-email" className="mt-4 inline-block text-xs font-semibold text-[#176b52] hover:underline">Resend account verification</Link>}
            </section>

            <section className="flex flex-col justify-between gap-5 rounded-2xl border border-stone-200 bg-white p-5 sm:flex-row sm:items-center sm:p-7">
              <div><h2 className="text-sm font-semibold">Password and sign-in</h2><p className="mt-1 text-xs leading-5 text-stone-500">Password changes are confirmed through a link sent to your verified email.</p></div>
              <Link href="/forgot-password" className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-stone-300 px-4 text-xs font-semibold text-stone-700 hover:bg-stone-50">Reset password</Link>
            </section>

            <section className="flex flex-col justify-between gap-5 rounded-2xl border border-stone-200 bg-white p-5 sm:flex-row sm:items-center sm:p-7">
              <div><h2 className="text-sm font-semibold">Download your data</h2><p className="mt-1 text-xs leading-5 text-stone-500">Export account details, documents, and uploaded images as JSON.</p></div>
              <a href="/api/account/export" className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-stone-300 px-4 text-xs font-semibold text-stone-700 hover:bg-stone-50"><Download className="h-4 w-4" /> Download JSON</a>
            </section>

            <section className="rounded-2xl border border-rose-200 bg-rose-50/70 p-5 sm:p-7">
              <div className="mb-5 flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-rose-100 text-rose-700"><Trash2 className="h-5 w-5" /></span><div><h2 className="text-sm font-semibold text-rose-900">Delete account</h2><p className="mt-1 text-xs leading-5 text-rose-800">This permanently removes your account, documents, collaboration rooms, search vectors, and uploaded files.</p></div></div>
              <form onSubmit={(event) => void deleteAccount(event)} className="space-y-4">
                <label className="block text-xs font-semibold text-rose-900">Current password<input required type="password" autoComplete="current-password" value={deletePassword} onChange={(event) => setDeletePassword(event.currentTarget.value)} className="mt-2 h-11 w-full rounded-lg border border-rose-200 bg-white px-3 text-sm font-normal outline-none focus:border-rose-500" /></label>
                <label className="block text-xs font-semibold text-rose-900">Type DELETE to confirm<input required value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.currentTarget.value)} className="mt-2 h-11 w-full rounded-lg border border-rose-200 bg-white px-3 text-sm font-normal outline-none focus:border-rose-500" /></label>
                <button disabled={deleting || deleteConfirmation !== "DELETE"} className="inline-flex h-10 items-center gap-2 rounded-lg bg-rose-700 px-4 text-xs font-semibold text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50">{deleting && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}Permanently delete account</button>
              </form>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
