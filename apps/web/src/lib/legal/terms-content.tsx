import Link from "next/link";
import type { LegalDocumentContent } from "@/components/legal/legal-document-view";

export const TERMS_CONTENT: LegalDocumentContent = {
  title: "Terms of Service",
  description: "The terms that govern your use of ClaimIt.",
  lastUpdated: "May 29, 2026",
  sections: [
    {
      id: "acceptance",
      title: "Acceptance of terms",
      body: (
        <p>
          By creating an account, connecting Gmail, or otherwise using ClaimIt, you agree to these
          Terms of Service. If you do not agree, do not use the service. These terms form a binding
          agreement between you and ClaimIt.
        </p>
      ),
    },
    {
      id: "the-service",
      title: "The service",
      body: (
        <>
          <p>
            ClaimIt is an AI agent system that monitors prices across retail, airline, and hotel
            platforms after you make a purchase, detects when you are eligible for a refund under
            that platform&apos;s price-protection policy, and generates the materials needed to
            submit the claim. We coordinate four sub-agents to ingest your purchases, monitor
            prices, draft claim materials, and answer your questions.
          </p>
          <p>
            We do not act as a financial advisor, legal advisor, or agent of any retailer. We help
            you exercise rights and policies that platforms already offer.
          </p>
        </>
      ),
    },
    {
      id: "eligibility",
      title: "Eligibility",
      body: (
        <p>
          You must be at least 18 years old to use ClaimIt. ClaimIt is available to users throughout
          the United States. By using the service, you represent that you meet these requirements.
        </p>
      ),
    },
    {
      id: "your-account",
      title: "Your account",
      body: (
        <>
          <p>
            You are responsible for keeping your account credentials secure and for all activity
            that occurs under your account. You agree to provide accurate information at
            registration and to keep it current.
          </p>
          <p>
            If you believe your account has been accessed without your authorization,{" "}
            <Link href="/help/contact">contact us</Link> immediately.
          </p>
        </>
      ),
    },
    {
      id: "gmail-authorization",
      title: "Gmail authorization",
      body: (
        <>
          <p>If you connect Gmail, you authorize ClaimIt to:</p>
          <ul>
            <li>Read incoming order confirmation emails for automatic purchase detection</li>
            <li>
              Send claim emails from your Gmail address when you approve them, or per an auto-send
              preference you have configured
            </li>
            <li>Mark processed emails as read or apply labels to keep your inbox organized</li>
          </ul>
          <p>
            You can revoke this authorization at any time from your settings or by visiting{" "}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noopener noreferrer"
            >
              myaccount.google.com/permissions
            </a>
            . Revoking authorization stops automatic purchase detection but does not affect claims
            you have already submitted.
          </p>
        </>
      ),
    },
    {
      id: "claim-processing",
      title: "How we process claims on your behalf",
      body: (
        <>
          <p>ClaimIt operates in two send modes:</p>
          <ul>
            <li>
              <strong>Approval-gated</strong> — we generate the claim material and present it to
              you. You review, edit if needed, and approve before anything is sent.
            </li>
            <li>
              <strong>Auto-send</strong> — for purchases where you have enabled it, we send the
              claim automatically. Each auto-send opens a five-minute cancellable queue so you can
              stop a send before it goes out.
            </li>
          </ul>
          <p>
            You can set a default preference at onboarding and override it on any individual claim.
          </p>
          <p>
            You are responsible for the accuracy of the information you submit to a platform. We
            draft claim materials based on the platform&apos;s stated policy and your purchase data,
            but the final submission represents your communication with that platform.
          </p>
        </>
      ),
    },
    {
      id: "acceptable-use",
      title: "Acceptable use",
      body: (
        <>
          <p>You agree not to:</p>
          <ul>
            <li>Use ClaimIt to submit fraudulent, inaccurate, or duplicate claims</li>
            <li>Attempt to reverse engineer, decompile, or disassemble the service</li>
            <li>Use automated tools to scrape, harvest, or extract data from ClaimIt</li>
            <li>Interfere with the service, other users, or the platforms we integrate with</li>
            <li>Impersonate another person or misrepresent your identity</li>
            <li>Use the service to violate any applicable law or platform terms of service</li>
          </ul>
        </>
      ),
    },
    {
      id: "disclaimers",
      title: "Service limitations and disclaimers",
      body: (
        <>
          <p>
            ClaimIt is provided on an as-is basis. We work hard to make it reliable but we cannot
            guarantee:
          </p>
          <ul>
            <li>That every eligible price drop will be detected</li>
            <li>That claims we submit will be approved by the platform</li>
            <li>That the price-protection policies we monitor will not change</li>
            <li>That the service will be uninterrupted or error-free</li>
          </ul>
          <p>
            Information about platform policies, claim windows, and procedures is our best
            interpretation of publicly available information. It is not legal advice. Each platform
            decides whether to approve a claim based on its own policies and processes.
          </p>
        </>
      ),
    },
    {
      id: "subscriptions",
      title: "Subscriptions and billing",
      body: (
        <>
          <p>
            ClaimIt offers tiered plans. Current plans, features, and pricing are listed on our{" "}
            <Link href="/pricing">pricing page</Link>.
          </p>
          <p>
            Paid subscriptions renew automatically at the end of each billing period unless
            cancelled. You can cancel at any time from your settings; cancellation takes effect at
            the end of the current billing period and does not entitle you to a refund for the
            remainder of that period.
          </p>
          <p>
            We may change pricing or plan features by notifying you at least 30 days in advance.
            Continued use after the effective date constitutes acceptance of the changes.
          </p>
        </>
      ),
    },
    {
      id: "intellectual-property",
      title: "Intellectual property",
      body: (
        <>
          <p>
            ClaimIt and all of its underlying software, designs, brand elements, and content are
            owned by us and protected by intellectual property laws. We grant you a limited,
            non-exclusive, non-transferable license to use the service in accordance with these
            terms.
          </p>
          <p>
            Content you upload or generate through the service — receipts, claim drafts,
            conversations — remains yours. You grant us a license to process, store, and use that
            content as necessary to provide the service to you.
          </p>
        </>
      ),
    },
    {
      id: "liability",
      title: "Limitation of liability",
      body: (
        <>
          <p>
            To the maximum extent permitted by law, ClaimIt and its affiliates are not liable for
            any indirect, incidental, special, consequential, or punitive damages arising from your
            use of the service.
          </p>
          <p>
            Our total aggregate liability for any claim arising out of or relating to these terms or
            the service is limited to the greater of one hundred US dollars or the amount you paid
            us in the twelve months preceding the event giving rise to the claim.
          </p>
        </>
      ),
    },
    {
      id: "termination",
      title: "Termination",
      body: (
        <>
          <p>You may stop using ClaimIt and delete your account at any time from settings.</p>
          <p>
            We may suspend or terminate your account if you violate these terms, abuse the service,
            or engage in conduct that puts us or other users at risk. We will provide notice and an
            opportunity to cure where reasonably possible.
          </p>
          <p>
            Sections that by their nature should survive termination — including intellectual
            property, limitation of liability, and governing law — will continue to apply.
          </p>
        </>
      ),
    },
    {
      id: "changes",
      title: "Changes to terms",
      body: (
        <p>
          We may update these Terms of Service from time to time. When we do, we will update the
          &quot;Last updated&quot; date at the top of this page. For material changes, we will
          notify you by email or through the product at least 30 days before they take effect.
          Continued use of the service after the effective date constitutes acceptance of the
          updated terms.
        </p>
      ),
    },
    {
      id: "governing-law",
      title: "Governing law and disputes",
      body: (
        <>
          <p>
            These terms are governed by the laws of the State of California, without regard to its
            conflict-of-laws principles.
          </p>
          <p>
            Any dispute arising out of or relating to these terms or the service shall be resolved
            in the state or federal courts located in California, and you consent to the
            jurisdiction of those courts. You may also bring qualifying disputes in small-claims
            court in your local jurisdiction.
          </p>
          <p>
            Nothing in these terms limits any right you may have under applicable consumer
            protection laws in your state of residence.
          </p>
        </>
      ),
    },
    {
      id: "contact",
      title: "Contact us",
      body: (
        <p>
          For questions about these terms, visit our <Link href="/help/contact">contact page</Link>{" "}
          and we will respond.
        </p>
      ),
    },
  ],
};
