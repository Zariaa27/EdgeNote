"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSending(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to request a password reset.");
      setMessage(payload.message ?? "Check your email for next steps.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to request a password reset.");
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-[#f5f4ef] px-5">
      <section className="w-full max-w-md rounded-2xl border border-stone-200 bg-[#fbfaf6] p-7 sm:p-9">
        <Link href="/login" className="text-xs font-semibold text-[#176b52] hover:underline">← Back to sign in</Link>
        <p className="mb-2 mt-8 font-mono text-[10px] uppercase tracking-[.18em] text-stone-500">Account recovery</p>
        <h1 className="font-display text-4xl">Reset password</h1>
        <p className="mt-3 text-sm leading-6 text-stone-500">We’ll send a one-time reset link to your verified email address.</p>
        <form onSubmit={(event) => void submit(event)} className="mt-7 space-y-4">
          <label className="block text-xs font-semibold text-stone-700">Email address<input type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.currentTarget.value)} className="mt-2 h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm font-normal outline-none focus:border-[#176b52]" /></label>
          {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</p>}
          {message && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900">{message}</p>}
          <button disabled={sending} className="h-11 w-full rounded-lg bg-[#176b52] text-sm font-semibold text-white disabled:opacity-60">{sending ? "Sending…" : "Send reset link"}</button>
        </form>
      </section>
    </main>
  );
}
