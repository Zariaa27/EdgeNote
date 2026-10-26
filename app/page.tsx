import Link from "next/link";
import { ArrowDown, ArrowRight, Check, Sparkles, Users, Waves } from "lucide-react";
import BrandMark from "../components/BrandMark";
import LandingNav from "../components/LandingNav";
import SessionRedirect from "../components/SessionRedirect";

export default function HomePage() {
  return (
    <main className="landing-page min-h-screen overflow-hidden bg-[#f5f4ef] text-[#17251f]">
      <SessionRedirect />
      <LandingNav />

      <section className="landing-grid relative mx-auto grid max-w-7xl gap-10 px-5 pb-16 pt-10 sm:px-8 sm:pb-24 sm:pt-16 lg:grid-cols-[1.08fr_.92fr] lg:items-center">
        <div className="relative z-10">
          <p className="mb-6 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.18em] text-[#53685a]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#338363]" /> 01 / Collaborative workspace
          </p>
          <h1 className="max-w-3xl font-display text-[2.75rem] leading-[.98] tracking-[-.04em] sm:text-7xl lg:text-[5.25rem]">
            Notes that move
            <br />
            <span className="italic text-[#277157]">with your team.</span>
          </h1>
          <p className="mt-7 max-w-xl text-base leading-7 text-stone-600 sm:text-lg sm:leading-8">
            A clear space for notes, drafts, and shared thinking. Write in Markdown, work together in real time, and find the thread again.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/register" className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#176b52] px-5 text-sm font-semibold text-white transition hover:bg-[#12543f]">
              Create your workspace <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/login" className="inline-flex h-12 items-center justify-center rounded-lg border border-stone-300 bg-[#fbfaf6] px-5 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:bg-white">
              I already have an account
            </Link>
          </div>
          <p className="mt-5 flex items-center gap-2 text-xs text-stone-500"><Check className="h-3.5 w-3.5 text-[#277157]" /> Private by default. Yours from the first keystroke.</p>
        </div>

        <div className="relative z-10 mx-auto w-full max-w-[530px]">
          <div className="landing-preview overflow-hidden border border-stone-300 bg-[#fbfaf6]">
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
                  <div className="mt-7 border-l-2 border-[#d6ab4e] bg-[#f8f3e7] px-4 py-3 text-xs leading-5 text-stone-600">
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
      </section>

      <section className="border-y border-stone-200 bg-[#fbfaf6]">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 sm:grid-cols-3 sm:px-8 sm:py-12">
          {[
            { n: "01", title: "Write without friction", text: "A clean Markdown canvas that keeps the focus on what you want to say." },
            { n: "02", title: "Stay in the same moment", text: "Realtime collaboration keeps your team close to the latest thought." },
            { n: "03", title: "Find the thread again", text: "Search notes by meaning and get back to the idea that matters." },
          ].map((feature) => (
            <article key={feature.n} className="flex gap-4 border-t border-stone-200 pt-4">
              <span className="pt-1 font-mono text-[10px] text-[#9a7b3d]">{feature.n} /</span>
              <div><h2 className="text-sm font-semibold">{feature.title}</h2><p className="mt-2 max-w-xs text-sm leading-6 text-stone-500">{feature.text}</p></div>
            </article>
          ))}
        </div>
      </section>

      <footer className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-xs text-stone-500 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <Link href="/" className="inline-flex items-center gap-2 font-semibold text-[#173b30]"><BrandMark /> EdgeNote</Link>
        <span>A little more space for what matters.</span>
        <nav aria-label="Legal" className="flex flex-wrap gap-4">
          <Link href="/terms" className="hover:text-[#176b52]">Terms</Link>
          <Link href="/privacy" className="hover:text-[#176b52]">Privacy</Link>
          <Link href="/cookies" className="hover:text-[#176b52]">Cookies</Link>
          <Link href="/register" className="inline-flex items-center gap-1 font-semibold text-[#176b52] hover:underline">Start writing <ArrowDown className="h-3.5 w-3.5 -rotate-90" /></Link>
        </nav>
      </footer>
    </main>
  );
}