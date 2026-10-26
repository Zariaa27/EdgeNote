import type { Metadata } from "next";
import LegalPageLayout from "../../components/LegalPageLayout";

export const metadata: Metadata = {
  title: "Terms of Service | EdgeNote",
  description: "Terms for using EdgeNote.",
};

export default function TermsPage() {
  return (
    <LegalPageLayout
      title="Terms of Service"
      intro="These terms govern your use of EdgeNote, a collaborative note-taking service operated by Alexis Trudeau in Québec, Canada. By creating an account or using EdgeNote, you agree to these terms."
    >
      <section>
        <h2 className="text-lg font-semibold text-[#17251f]">Eligibility and accounts</h2>
        <p>You must be at least 13 years old and legally permitted to use the service in your location. If local law requires parent or guardian consent for you to use an online service, you may use EdgeNote only after obtaining that consent. You are responsible for your account credentials and activity. Provide accurate account information and keep your password secure.</p>
      </section>
      <section>
        <h2 className="text-lg font-semibold text-[#17251f]">Your content and sharing</h2>
        <p>You retain your rights in documents and files you submit. You give EdgeNote permission to host, store, reproduce, transmit, and process that content only as needed to operate the features you use, including collaboration, sharing, backups, search, and AI summaries. You decide whether to share a document with invited users or make it available through a public link. You are responsible for having the rights and permissions needed to upload or share content.</p>
      </section>
      <section>
        <h2 className="text-lg font-semibold text-[#17251f]">Acceptable use</h2>
        <p>Do not use EdgeNote unlawfully, interfere with its security or operation, access another person&apos;s account or private content without permission, or upload content that infringes another person&apos;s rights. We may suspend or restrict access when reasonably necessary to protect users, the service, or comply with law.</p>
      </section>
      <section>
        <h2 className="text-lg font-semibold text-[#17251f]">AI features and availability</h2>
        <p>When you request an AI summary or semantic search, relevant document text may be processed by Cloudflare Workers AI and Cloudflare Vectorize to provide that feature. AI output may be incomplete or inaccurate; review it before relying on it. EdgeNote may change or discontinue features and may experience interruptions.</p>
      </section>
      <section>
        <h2 className="text-lg font-semibold text-[#17251f]">Account closure and changes</h2>
        <p>You can request account deletion in account settings. Deletion removes account data from the active application systems; residual copies in backups or logs may remain for up to 30 days. These terms may be updated as the service changes. Material updates will be reflected here with a revised date; continued use after an update means acceptance where permitted by law.</p>
      </section>
      <section>
        <h2 className="text-lg font-semibold text-[#17251f]">Contact</h2>
        <p>For questions about these terms, contact <a href="mailto:privacy@alexistrudeau.xyz" className="text-[#176b52] underline">privacy@alexistrudeau.xyz</a>.</p>
      </section>
    </LegalPageLayout>
  );
}
