"use client";

import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import BrandMark from "./BrandMark";
import ThemeToggle from "./ThemeToggle";

export default function LandingNav() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <header className="landing-nav relative z-20 mx-auto flex min-h-[68px] max-w-7xl items-center justify-between border-b border-stone-200 px-5 sm:px-8">
      <Link href="/" className="inline-flex items-center gap-3 text-[15px] font-bold tracking-tight" onClick={() => setOpen(false)}>
        <BrandMark />
        EdgeNote
      </Link>

      <nav aria-label="Main navigation" className="hidden items-center gap-7 md:flex">
        <ThemeToggle />
        <Link href="/login" className="text-sm font-medium text-stone-600 transition hover:text-[#173b30]">Sign in</Link>
        <Link href="/register" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#173b30] px-4 text-sm font-semibold text-white transition hover:bg-[#245744]">
          Get started <ArrowRight className="h-4 w-4" />
        </Link>
      </nav>

      <button
        type="button"
        aria-label={open ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={open}
        aria-controls="mobile-navigation"
        onClick={() => setOpen((current) => !current)}
        className="grid h-10 w-10 place-items-center rounded-lg border border-stone-300 text-stone-700 transition hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176b52] md:hidden"
      >
        {open ? <X aria-hidden="true" className="h-5 w-5" /> : <Menu aria-hidden="true" className="h-5 w-5" />}
      </button>

      <nav id="mobile-navigation" aria-label="Mobile navigation" hidden={!open} className="absolute inset-x-3 top-[calc(100%+0.5rem)] rounded-xl border border-stone-300 bg-[#fbfaf6] p-3 md:hidden">
          <div className="flex items-center justify-between border-b border-stone-200 px-2 pb-3">
            <span className="text-xs font-semibold uppercase tracking-[.12em] text-stone-500">Menu</span>
            <ThemeToggle />
          </div>
          <div className="grid gap-1 pt-2">
            <Link href="/login" onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-sm font-medium text-stone-700 hover:bg-stone-100">Sign in</Link>
            <Link href="/register" onClick={() => setOpen(false)} className="flex items-center justify-between rounded-lg bg-[#173b30] px-3 py-3 text-sm font-semibold text-white hover:bg-[#245744]">
              Create your workspace <ArrowRight className="h-4 w-4" />
            </Link>
            <div className="mt-2 flex gap-4 border-t border-stone-200 px-3 pt-3 text-xs text-stone-500">
              <Link href="/terms" onClick={() => setOpen(false)} className="hover:text-[#176b52]">Terms</Link>
              <Link href="/privacy" onClick={() => setOpen(false)} className="hover:text-[#176b52]">Privacy</Link>
              <Link href="/cookies" onClick={() => setOpen(false)} className="hover:text-[#176b52]">Cookies</Link>
            </div>
          </div>
      </nav>
    </header>
  );
}
