"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export default function PasswordResetForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const payload = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to reset password.");
      setMessage(payload.message ?? "Password updated.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to reset password.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-[#f5f4ef] px-5">
      <section className="w-full max-w-md rounded-2xl border border-stone-200 bg-[#fbfaf6] p-7 sm:p-9">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[.18em] text-stone-500">Account recovery</p>
        <h1 className="font-display text-4xl">Choose a new password</h1>
        {!token && <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">This reset link is missing or invalid.</p>}
        <form onSubmit={(event) => void submit(event)} className="mt-7 space-y-4">
          <label className="block text-xs font-semibold text-stone-700">New password<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.currentTarget.value)} className="mt-2 h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm font-normal outline-none focus:border-[#176b52]" /></label>
          <label className="block text-xs font-semibold text-stone-700">Confirm password<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.currentTarget.value)} className="mt-2 h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm font-normal outline-none focus:border-[#176b52]" /></label>
          {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</p>}
          {message && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900">{message} <Link href="/login" className="font-semibold underline">Sign in</Link></p>}
          <button disabled={saving || !token} className="h-11 w-full rounded-lg bg-[#176b52] text-sm font-semibold text-white disabled:opacity-60">{saving ? "Updating…" : "Update password"}</button>
        </form>
      </section>
    </main>
  );
}
