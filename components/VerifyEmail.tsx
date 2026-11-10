"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import {
  getVerificationResendCooldownMs,
  recordVerificationResend,
} from "../src/client/verification-resend";

const VERIFICATION_RESEND_COOLDOWN_MS = 5 * 60 * 1000;

export default function VerifyEmail({ token }: { token: string }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(Boolean(token));
  const [resendAvailableAt, setResendAvailableAt] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const resendSecondsRemaining = Math.max(0, Math.ceil((resendAvailableAt - currentTime) / 1000));

  useEffect(() => {
    if (!email) {
      setResendAvailableAt(0);
      return;
    }
    setCurrentTime(Date.now());
    const remaining = getVerificationResendCooldownMs(email);
    setResendAvailableAt(remaining > 0 ? Date.now() + remaining : 0);
  }, [email]);

  useEffect(() => {
    if (resendAvailableAt <= 0) return;
    const interval = window.setInterval(() => {
      const now = Date.now();
      setCurrentTime(now);
      if (now >= resendAvailableAt) setResendAvailableAt(0);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [resendAvailableAt]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    void fetch("/api/auth/verification/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (response) => {
        const payload = await response.json() as { message?: string; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Unable to verify email.");
        if (active) setMessage(`${payload.message ?? "Email verified."} You can continue to your workspace.`);
      })
      .catch((verifyError: unknown) => {
        if (active) setError(verifyError instanceof Error ? verifyError.message : "Unable to verify email.");
      })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [token]);

  const resend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/auth/verification/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to request verification.");
      recordVerificationResend(email);
      setCurrentTime(Date.now());
      setResendAvailableAt(Date.now() + VERIFICATION_RESEND_COOLDOWN_MS);
      setMessage(payload.message ?? "Check your email for next steps.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to request verification.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-[#f5f4ef] px-5">
      <section className="w-full max-w-md rounded-2xl border border-stone-200 bg-[#fbfaf6] p-7 sm:p-9">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[.18em] text-stone-500">Email verification</p>
        <h1 className="font-display text-4xl">{token ? "Confirm your email" : "Verify your account"}</h1>
        {busy && token && <p role="status" className="mt-4 text-sm text-stone-500">Checking your verification link…</p>}
        {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
        {message && <p role="status" className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{message} <Link href="/workspace" className="font-semibold underline">Open workspace</Link></p>}
        {!token && (
          <>
            <p className="mt-3 text-sm leading-6 text-stone-500">Enter your account email and we’ll send a fresh confirmation link.</p>
            <form onSubmit={(event) => void resend(event)} className="mt-7 space-y-4">
              <label className="block text-xs font-semibold text-stone-700">Email address<input type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.currentTarget.value)} className="mt-2 h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm font-normal outline-none focus:border-[#176b52]" /></label>
              <button disabled={busy || resendSecondsRemaining > 0} className="h-11 w-full rounded-lg bg-[#176b52] text-sm font-semibold text-white disabled:opacity-60">{busy ? "Sending…" : resendSecondsRemaining > 0 ? `Resend available in ${Math.floor(resendSecondsRemaining / 60)}:${String(resendSecondsRemaining % 60).padStart(2, "0")}` : "Send verification link"}</button>
            </form>
          </>
        )}
        <Link href="/login" className="mt-6 inline-block text-xs font-semibold text-[#176b52] hover:underline">Back to sign in</Link>
      </section>
    </main>
  );
}
