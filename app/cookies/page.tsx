import type { Metadata } from "next";
import LegalPageLayout from "../../components/LegalPageLayout";

export const metadata: Metadata = {
  title: "Cookie Notice | EdgeNote",
  description: "Details about cookies and browser storage used by EdgeNote.",
};

export default function CookiesPage() {
  return (
    <LegalPageLayout
      title="Cookie Notice"
      intro="EdgeNote currently uses only storage needed to provide requested account and interface features. It does not set advertising or analytics cookies."
    >
      <section>
        <h2 className="text-lg font-semibold text-[#17251f]">Essential sign-in cookie</h2>
        <p>The `edgenote_session` cookie keeps you signed in. It is HttpOnly, uses SameSite=Lax, is marked Secure on HTTPS, and expires after 30 days. It is required for authenticated features and cannot be disabled while using an account.</p>
      </section>
      <section>
        <h2 className="text-lg font-semibold text-[#17251f]">Local browser storage</h2>
        <p>EdgeNote uses local storage to remember your light/dark theme and that you have seen this notice. Session storage remembers the five-minute verification-email resend cooldown for the current browser tab. These values are not used for advertising or cross-site tracking.</p>
      </section>
      <section>
        <h2 className="text-lg font-semibold text-[#17251f]">Your choice</h2>
        <p>The notice offers essential storage only because there are no optional analytics or advertising cookies to accept. If optional cookies are introduced, EdgeNote must update this notice and obtain any consent required by your location before enabling them. You can clear browser storage or sign out; clearing essential session storage may sign you out or reset preferences.</p>
      </section>
      <section>
        <h2 className="text-lg font-semibold text-[#17251f]">Contact</h2>
        <p>Questions about browser storage can be sent to <a href="mailto:privacy@alexistrudeau.xyz" className="text-[#176b52] underline">privacy@alexistrudeau.xyz</a>.</p>
      </section>
    </LegalPageLayout>
  );
}
