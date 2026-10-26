import type { Metadata } from "next";
import LegalPageLayout from "../../components/LegalPageLayout";

export const metadata: Metadata = {
  title: "Privacy Policy | EdgeNote",
  description: "How EdgeNote handles account information, documents, and service data.",
};

export default function PrivacyPage() {
  return (
    <LegalPageLayout
      title="Privacy Policy"
      intro="This policy describes personal information handled by EdgeNote, operated by Alexis Trudeau in Québec, Canada, for users worldwide. It is a product-level disclosure and must be reviewed for the laws that apply to you and your users."
    >
      <section>
        <h2 className="text-lg font-semibold text-[#17251f]">Information we handle</h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>Account details: name, email address, password hash, verification status, and account creation time.</li>
          <li>Content and collaboration: documents, document metadata, tags, attachments, public-link settings, and email-based sharing permissions.</li>
          <li>Security and account operations: hashed verification and recovery tokens, sign-in session cookie, and timestamps associated with account activity.</li>
          <li>Browser storage: your theme preference, verification-resend cooldown, and acknowledgement that you have seen the cookie notice.</li>
          <li>Operational data: requests may be processed by Cloudflare as it hosts and secures the application. Its infrastructure may process network and diagnostic information under its own terms.</li>
        </ul>
      </section>
      <section>
        <h2 className="text-lg font-semibold text-[#17251f]">How information is used</h2>
        <p>Information is used to create and secure accounts, verify email addresses, recover accounts, send requested security notifications and invitations, store and synchronize documents, apply sharing choices, provide AI summaries and semantic search when requested, and maintain the service. EdgeNote does not currently use advertising or analytics trackers.</p>
      </section>
      <section>
        <h2 className="text-lg font-semibold text-[#17251f]">Service providers and international processing</h2>
        <p>EdgeNote uses Cloudflare services including Workers, D1, R2, Durable Objects, Workers AI, and Vectorize to run the application and its features. Resend delivers account and invitation emails. Information may be processed in countries where these providers operate, including outside Canada, subject to their respective terms and safeguards. Review those providers&apos; privacy disclosures for details of their processing.</p>
      </section>
      <section>
        <h2 className="text-lg font-semibold text-[#17251f]">Sharing and public content</h2>
        <p>Documents are private by default. If you grant access to another account or enable a public link, the selected content becomes available to those recipients or anyone with the link, as applicable. Resend receives recipient addresses and message content needed to deliver email. EdgeNote does not sell personal information or share it for third-party advertising.</p>
      </section>
      <section>
        <h2 className="text-lg font-semibold text-[#17251f]">Retention and security</h2>
        <p>Account information and content remain in active application systems until you delete your account or the information is otherwise removed through the service. After deletion, residual copies in backups or logs may remain for up to 30 days. Security measures include password hashing, HttpOnly session cookies, hashed single-use email tokens, and access checks for private documents. No internet service can guarantee absolute security.</p>
      </section>
      <section>
        <h2 className="text-lg font-semibold text-[#17251f]">Your choices and privacy requests</h2>
        <p>You can update account details, export account data, or request account deletion through account settings. You may also contact us to request access, correction, or deletion, or to ask a privacy question. We may need to verify your identity and will respond as required by applicable law. Contact the person responsible for privacy at <a href="mailto:privacy@alexistrudeau.xyz" className="text-[#176b52] underline">privacy@alexistrudeau.xyz</a>.</p>
      </section>
      <section>
        <h2 className="text-lg font-semibold text-[#17251f]">Children and age eligibility</h2>
        <p>EdgeNote is not intended for children below 13. Users must also meet any higher minimum age or obtain parent/guardian consent required by the laws where they live. The current signup flow records the user&apos;s confirmation but does not independently verify age or guardian consent; a guardian should contact us before a minor uses the service where local law requires consent.</p>
      </section>
      <section>
        <h2 className="text-lg font-semibold text-[#17251f]">Changes and contact</h2>
        <p>We may update this policy as the service changes. The current version and its update date will be posted on this page. For privacy requests, contact Alexis Trudeau at <a href="mailto:privacy@alexistrudeau.xyz" className="text-[#176b52] underline">privacy@alexistrudeau.xyz</a>.</p>
      </section>
    </LegalPageLayout>
  );
}
