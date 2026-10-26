import Link from "next/link";

const updated = "October 26, 2026";

export default function LegalPageLayout({
  title,
  intro,
  children,
}: Readonly<{
  title: string;
  intro: string;
  children: React.ReactNode;
}>) {
  return (
    <main className="min-h-screen bg-[#f5f4ef] px-5 py-10 text-[#17251f] sm:px-8">
      <article className="mx-auto max-w-3xl rounded-2xl border border-stone-200 bg-[#fbfaf6] p-6 sm:p-10">
        <nav className="mb-8 flex flex-wrap gap-x-5 gap-y-2 border-b border-stone-200 pb-4 text-sm">
          <Link href="/" className="font-semibold text-[#176b52] hover:underline">EdgeNote</Link>
          <Link href="/terms" className="text-stone-600 hover:text-[#176b52]">Terms</Link>
          <Link href="/privacy" className="text-stone-600 hover:text-[#176b52]">Privacy</Link>
          <Link href="/cookies" className="text-stone-600 hover:text-[#176b52]">Cookies</Link>
        </nav>
        <p className="font-mono text-[10px] uppercase tracking-[.18em] text-stone-500">Last updated {updated}</p>
        <h1 className="mt-3 font-display text-4xl sm:text-5xl">{title}</h1>
        <p className="mt-5 text-base leading-7 text-stone-600">{intro}</p>
        <aside className="mt-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
          Draft for legal review. These product disclosures are not legal advice and do not guarantee compliance in every jurisdiction. The service is operated online by Alexis Trudeau in Québec, Canada; no public mailing address is currently provided. Review with qualified counsel before relying on these terms for launch.
        </aside>
        <div className="legal-copy mt-8 space-y-8 text-sm leading-7 text-stone-700">{children}</div>
        <footer className="mt-10 border-t border-stone-200 pt-5 text-xs text-stone-500">
          Questions or privacy requests: <a href="mailto:privacy@alexistrudeau.xyz" className="font-semibold text-[#176b52] underline">privacy@alexistrudeau.xyz</a>
        </footer>
      </article>
    </main>
  );
}
