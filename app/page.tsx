import Link from "next/link";
import { ArrowDown, ArrowRight, Check, Sparkles, Users, Waves } from "lucide-react";
import BrandMark from "../components/BrandMark";
import SessionRedirect from "../components/SessionRedirect";
import ThemeToggle from "../components/ThemeToggle";

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f5f4ef] text-[#17251f]">
      <SessionRedirect />
      <header className="relative z-10 mx-auto flex h-[76px] max-w-7xl items-center justify-between px-5 sm:px-8">
        <Link href="/" className="inline-flex items-center gap-3 text-[15px] font-bold tracking-tight">
          <BrandMark />
          EdgeNote
        </Link>
        <nav className="flex items-center gap-3 sm:gap-7">
          <ThemeToggle />
          <Link href="/login" className="text-sm font-medium text-stone-600 transition hover:text-[#173b30]">Sign in</Link>
          <Link href="/register" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#173b30] px-4 text-sm font-semibold text-white transition hover:bg-[#245744]">
            Get started <ArrowRight className="h-4 w-4" />
          </Link>
        </nav>
      </header>

      <section className="relative mx-auto grid max-w-7xl gap-12 px-5 pb-20 pt-12 sm:px-8 sm:pb-28 sm:pt-20 lg:grid-cols-[1.08fr_.92fr] lg:items-center">
        <div className="absolute -left-48 top-10 -z-0 h-[28rem] w-[28rem] rounded-full bg-[#dfe9dd]/70 blur-3xl" />
        <div className="relative z-10">
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#cdd8cd] bg-white/70 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[.15em] text-[#53685a]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#338363]" /> A calmer way to work together
          </p>
          <h1 className="max-w-3xl font-display text-[3.5rem] leading-[.98] tracking-[-.04em] sm:text-7xl lg:text-[5.5rem]">
            Let good ideas
            <br />
            <span className="italic text-[#277157]">find their shape.</span>
          </h1>
          <p className="mt-7 max-w-xl text-base leading-7 text-stone-600 sm:text-lg sm:leading-8">
            A thoughtful home for notes, drafts, and the work that grows between people. Write in Markdown, stay in sync, and keep every idea close.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/register" className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#176b52] px-5 text-sm font-semibold text-white shadow-[0_8px_22px_-12px_#176b52] transition hover:-translate-y-0.5 hover:bg-[#12543f]">
              Create your workspace <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/login" className="inline-flex h-12 items-center justify-center rounded-lg border border-stone-300 bg-[#fbfaf6] px-5 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:bg-white">
              I already have an account
            </Link>
          </div>
          <p className="mt-5 flex items-center gap-2 text-xs text-stone-500"><Check className="h-3.5 w-3.5 text-[#277157]" /> Private by default. Yours from the first keystroke.</p>
        </div>

        <div className="relative z-10 mx-auto w-full max-w-[530px]">
          <div className="absolute -right-5 -top-7 h-36 w-36 rounded-full border border-[#d8c79f]/70 sm:-right-9 sm:-top-10 sm:h-48 sm:w-48" />
          <div className="absolute -bottom-6 -left-5 h-28 w-28 rounded-full bg-[#e6bd69]/25 blur-xl" />
          <div className="relative rotate-[1deg] rounded-[22px] border border-white/80 bg-[#fbfaf6] p-3 shadow-[0_28px_90px_-38px_rgba(30,55,42,.35)] sm:p-4">
            <div className="overflow-hidden rounded-[15px] border border-stone-200 bg-white">
              <div className="flex h-12 items-center justify-between border-b border-stone-200 px-4">
                <div className="flex items-center gap-2"><BrandMark /><span className="text-xs font-semibold">Field notes</span></div>
                <div className="flex items-center gap-1.5 rounded-full bg-[#eaf1e9] px-2.5 py-1 text-[10px] font-medium text-[#27664f]"><span className="h-1.5 w-1.5 rounded-full bg-[#38916a]" /> Live</div>
              </div>
              <div className="grid min-h-[320px] sm:min-h-[360px] sm:grid-cols-[1fr_136px]">
                <article className="px-5 py-7 sm:px-8 sm:py-9">
                  <p className="font-mono text-[9px] uppercase tracking-[.16em] text-stone-400">A note in progress · 2 collaborators</p>
                  <h2 className="mt-4 font-display text-3xl leading-tight text-[#1d2e25] sm:text-4xl">Small rituals,<br /><span className="italic text-[#277157]">better work.</span></h2>
                  <div className="mt-6 space-y-3">
                    <div className="h-2 w-full rounded bg-[#e9e8e2]" />
                    <div className="h-2 w-[92%] rounded bg-[#e9e8e2]" />
                    <div className="h-2 w-[68%] rounded bg-[#e9e8e2]" />
                  </div>
                  <div className="mt-7 rounded-r-md border-l-[3px] border-[#d6ab4e] bg-[#f8f3e7] px-4 py-3 text-xs leading-5 text-stone-600">
                    The best ideas rarely arrive finished. Make room for the first version.
                  </div>
                  <div className="mt-7 flex items-center gap-2 text-[10px] text-stone-400"><Waves className="h-3.5 w-3.5 text-[#38816a]" /> Changes saved just now</div>
                </article>
                <aside className="hidden border-l border-stone-200 bg-[#faf9f5] p-4 sm:block">
                  <p className="font-mono text-[9px] uppercase tracking-wider text-stone-400">In this note</p>
                  <div className="mt-4 flex -space-x-1.5">
                    <span className="grid h-7 w-7 place-items-center rounded-full border-2 border-white bg-[#e7c88b] text-[9px] font-bold">A</span>
                    <span className="grid h-7 w-7 place-items-center rounded-full border-2 border-white bg-[#b8cec0] text-[9px] font-bold">M</span>
                  </div>
                  <div className="mt-6 space-y-3">
                    <div className="rounded-lg border border-stone-200 bg-white p-2.5"><Sparkles className="h-3.5 w-3.5 text-[#a27620]" /><div className="mt-2 h-1.5 w-full rounded bg-stone-200" /><div className="mt-1.5 h-1.5 w-4/5 rounded bg-stone-100" /></div>
                    <div className="rounded-lg border border-stone-200 bg-white p-2.5"><Users className="h-3.5 w-3.5 text-[#36735c]" /><div className="mt-2 text-[9px] text-stone-500">In sync, together.</div></div>
                  </div>
                </aside>
              </div>
            </div>
          </div>
          <div className="absolute -bottom-5 right-5 inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-3 text-xs font-medium text-stone-600 shadow-lg sm:right-10">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#e8f0e9] text-[#277157]"><Check className="h-4 w-4" /></span>
            Your thoughts, safely kept
          </div>
        </div>
      </section>

      <section className="border-y border-stone-200 bg-[#fbfaf6]">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 sm:grid-cols-3 sm:px-8 sm:py-12">
          {[
            { n: "01", title: "Write without friction", text: "A clean Markdown canvas that keeps the focus on what you want to say." },
            { n: "02", title: "Stay in the same moment", text: "Realtime collaboration keeps your team close to the latest thought." },
            { n: "03", title: "Find the thread again", text: "Search notes by meaning and get back to the idea that matters." },
          ].map((feature) => (
            <article key={feature.n} className="flex gap-4">
              <span className="pt-1 font-mono text-[10px] text-[#9a7b3d]">{feature.n}</span>
              <div><h2 className="text-sm font-semibold">{feature.title}</h2><p className="mt-2 max-w-xs text-sm leading-6 text-stone-500">{feature.text}</p></div>
            </article>
          ))}
        </div>
      </section>

      <footer className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-xs text-stone-500 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <Link href="/" className="inline-flex items-center gap-2 font-semibold text-[#173b30]"><BrandMark /> EdgeNote</Link>
        <span>A little more space for what matters.</span>
        <Link href="/register" className="inline-flex items-center gap-1 font-semibold text-[#176b52] hover:underline">Start writing <ArrowDown className="h-3.5 w-3.5 -rotate-90" /></Link>
      </footer>
    </main>
  );
}