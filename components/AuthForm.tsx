"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import {
  getVerificationResendCooldownMs,
  recordVerificationResend,
} from "../src/client/verification-resend";
import BrandMark from "./BrandMark";
import ThemeToggle from "./ThemeToggle";

interface AuthFormProps {
  mode: "login" | "register";
}

const VERIFICATION_RESEND_COOLDOWN_MS = 5 * 60 * 1000;

export default function AuthForm({ mode }: AuthFormProps) {
  const isRegister = mode === "register";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendAvailableAt, setResendAvailableAt] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const resendSecondsRemaining = Math.max(0, Math.ceil((resendAvailableAt - currentTime) / 1000));

  useEffect(() => {
    if (!needsVerification) return;
    setCurrentTime(Date.now());
    const remaining = getVerificationResendCooldownMs(email);
    setResendAvailableAt(remaining > 0 ? Date.now() + remaining : 0);
  }, [email, needsVerification]);

  useEffect(() => {
    if (resendAvailableAt <= 0) return;
    const interval = window.setInterval(() => {
      const now = Date.now();
      setCurrentTime(now);
      if (now >= resendAvailableAt) setResendAvailableAt(0);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [resendAvailableAt]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    setSuccess("");
    setNeedsVerification(false);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          ...(isRegister ? {
            name,
            termsAccepted: new FormData(event.currentTarget).get("termsAccepted") === "on",
          } : {}),
        }),
      });
      const payload = await response.json() as { error?: string; message?: string; needsVerification?: boolean };
      if (!isRegister && payload.needsVerification) {
        setNeedsVerification(true);
        setError("");
        setSuccess(payload.error ?? "Verify your email address before signing in.");
        setIsSubmitting(false);
        return;
      }
      if (!response.ok) throw new Error(payload.error ?? "Unable to authenticate.");
      if (isRegister && payload.needsVerification) {
        recordVerificationResend(email);
        setSuccess(payload.message ?? "Check your email to verify your account before signing in.");
        setIsSubmitting(false);
        return;
      }
      const requestedPath = new URLSearchParams(window.location.search).get("next");
      const returnPath = requestedPath?.startsWith("/") && !requestedPath.startsWith("//") && !requestedPath.includes("\\")
        ? requestedPath
        : "/workspace";
      window.location.assign(returnPath);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to authenticate.");
      setIsSubmitting(false);
    }
  };

  const resendVerification = async () => {
    if (isResending || resendSecondsRemaining > 0) return;
    setIsResending(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/auth/verification/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to request verification.");
      recordVerificationResend(email);
      const availableAt = Date.now() + VERIFICATION_RESEND_COOLDOWN_MS;
      setCurrentTime(Date.now());
      setResendAvailableAt(availableAt);
      setSuccess(payload.message ?? "If the account needs verification, an email will be sent shortly.");
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : "Unable to request verification.");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <main className="grid min-h-screen bg-[#f5f4ef] lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
      <aside className="relative hidden min-h-screen flex-col justify-between overflow-hidden bg-[#173b30] px-12 py-10 text-[#f4f2e9] lg:flex xl:px-20">
        <div className="absolute -right-28 -top-28 h-[28rem] w-[28rem] rounded-full border border-white/10" />
        <div className="absolute -right-8 -top-8 h-[19rem] w-[19rem] rounded-full border border-white/10" />
        <Link href="/" className="relative z-10 inline-flex items-center gap-3 text-sm font-semibold tracking-wide">
          <BrandMark inverse />
          EdgeNote
        </Link>
        <div className="relative z-10 max-w-xl pb-8">
          <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.22em] text-[#c5d5c5]">A shared place for thought</p>
          <h1 className="font-display text-6xl leading-[0.98] xl:text-7xl">Keep the<br />good ideas<br /><span className="italic text-[#e7b957]">moving.</span></h1>
          <p className="mt-8 max-w-md text-sm leading-7 text-[#d0dcd4]">Write in Markdown, work together in real time, and find the note you need when you need it.</p>
        </div>
        <div className="relative z-10 flex items-center justify-between border-t border-white/15 pt-5 text-[11px] text-[#c5d5c5]">
          <span>Private by default</span>
          <span>Built for the edge</span>
        </div>
      </aside>

      <section className="flex min-h-screen flex-col px-6 py-7 sm:px-12 lg:px-16">
        <div className="flex items-center justify-between lg:justify-end">
          <ThemeToggle />
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-[#173b30] lg:hidden">
            <BrandMark />
            EdgeNote
          </Link>
          <Link href={isRegister ? "/login" : "/register"} className="text-sm text-stone-600 hover:text-[#176b52]">
            {isRegister ? "Already have an account?" : "New to EdgeNote?"}
            <span className="ml-1 font-semibold text-[#176b52]">{isRegister ? "Sign in" : "Create account"}</span>
          </Link>
        </div>

        <div className="mx-auto my-auto w-full max-w-[420px] py-12">
          <div className="mb-9">
            <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[#77847c]">Your workspace starts here</p>
            <h2 className="font-display text-4xl text-[#17251f]">{isRegister ? "Make room for ideas." : "Welcome back."}</h2>
            <p className="mt-3 text-sm leading-6 text-stone-500">{isRegister ? "Create your account and start your first document." : "Sign in to pick up where your team left off."}</p>
          </div>

          <form onSubmit={submit} className="space-y-5">
            {isRegister && (
              <label className="block text-xs font-semibold text-stone-700">
                Your name
                <input autoComplete="name" required maxLength={80} value={name} onChange={(event) => setName(event.currentTarget.value)} className="mt-2 h-12 w-full rounded-lg border border-stone-300 bg-white px-4 text-sm font-normal outline-none transition focus:border-[#176b52] focus:ring-2 focus:ring-[#176b52]/15" placeholder="Alex Morgan" />
              </label>
            )}
            {isRegister && (
              <label className="flex items-start gap-3 text-xs leading-5 text-stone-600">
                <input type="checkbox" name="termsAccepted" required className="mt-1 h-4 w-4 accent-[#176b52]" />
                <span>
                  I agree to the <Link href="/terms" target="_blank" className="font-semibold text-[#176b52] underline">Terms</Link> and <Link href="/privacy" target="_blank" className="font-semibold text-[#176b52] underline">Privacy Policy</Link>. I am at least 13 and legally eligible to use EdgeNote where I live; if guardian consent is required, I have it.
                </span>
              </label>
            )}
            <label className="block text-xs font-semibold text-stone-700">
              Email address
              <span className="relative mt-2 block">
                <Mail aria-hidden="true" className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                <input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.currentTarget.value)} className="h-12 w-full rounded-lg border border-stone-300 bg-white pl-11 pr-4 text-sm font-normal outline-none transition focus:border-[#176b52] focus:ring-2 focus:ring-[#176b52]/15" placeholder="you@example.com" />
              </span>
            </label>
            <label className="block text-xs font-semibold text-stone-700">
              Password
              <span className="relative mt-2 block">
                <LockKeyhole aria-hidden="true" className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                <input type={showPassword ? "text" : "password"} autoComplete={isRegister ? "new-password" : "current-password"} required minLength={isRegister ? 12 : 1} maxLength={128} value={password} onChange={(event) => setPassword(event.currentTarget.value)} className="h-12 w-full rounded-lg border border-stone-300 bg-white pl-11 pr-12 text-sm font-normal outline-none transition focus:border-[#176b52] focus:ring-2 focus:ring-[#176b52]/15" placeholder={isRegister ? "At least 12 characters" : "Your password"} />
                <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((visible) => !visible)} className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-700">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </span>
            </label>

            {error && !needsVerification && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
            {success && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{success}{!needsVerification && <Link href="/verify-email" className="ml-1 font-semibold underline">Resend verification</Link>}</p>}
            {needsVerification && (
              <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm text-amber-950">We’ll send a fresh verification link to <strong>{email}</strong>. You can request another in five minutes.</p>
                {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
                <button type="button" onClick={() => void resendVerification()} disabled={isResending || resendSecondsRemaining > 0} className="text-sm font-semibold text-[#176b52] underline disabled:cursor-not-allowed disabled:text-stone-400 disabled:no-underline">
                  {isResending ? "Sending…" : resendSecondsRemaining > 0 ? `Resend available in ${Math.floor(resendSecondsRemaining / 60)}:${String(resendSecondsRemaining % 60).padStart(2, "0")}` : "Resend verification email"}
                </button>
              </div>
            )}

            <button type="submit" disabled={isSubmitting} className="group flex h-12 w-full items-center justify-between rounded-lg bg-[#176b52] px-5 text-sm font-semibold text-white transition hover:bg-[#12543f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176b52] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70">
              <span>{isSubmitting ? "Please wait…" : isRegister ? "Create your account" : "Sign in"}</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
          </form>
          {!isRegister && (
            <div className="mt-5 flex justify-between gap-4 text-xs">
              <Link href="/forgot-password" className="font-semibold text-[#176b52] hover:underline">Forgot password?</Link>
              <Link href="/verify-email" className="text-stone-500 hover:text-[#176b52]">Verify account</Link>
            </div>
          )}

          <p className="mt-7 text-center text-xs leading-5 text-stone-400">
            By continuing, you agree to use EdgeNote responsibly and keep your account credentials private.
          </p>
        </div>

        <footer className="flex items-center justify-between text-[11px] text-stone-400">
          <span>EdgeNote · Collaborative Markdown</span>
          <span className="inline-flex items-center gap-1">Cloudflare edge <ArrowUpRight className="h-3 w-3" /></span>
        </footer>
      </section>
    </main>
  );
}