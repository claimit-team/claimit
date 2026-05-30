import Link from "next/link";
import type { LegalDocumentContent } from "@/components/legal/legal-document-view";

export const PRIVACY_CONTENT: LegalDocumentContent = {
  title: "Privacy Policy",
  description: "How ClaimIt collects, uses, and protects your information.",
  lastUpdated: "May 29, 2026",
  sections: [
    {
      id: "overview",
      title: "Overview",
      body: (
        <>
          <p>
            This Privacy Policy explains how ClaimIt collects, uses, stores, and protects
            information when you use our service. ClaimIt is an AI agent system that monitors prices
            across retail, airline, and hotel platforms after you purchase, detects when you&apos;re
            eligible for a refund under each platform&apos;s price-protection policy, and generates
            the claim materials needed to recover the difference.
          </p>
          <p>
            We designed ClaimIt with the understanding that the data you share — your inbox, your
            purchases, your claim history — is sensitive. This policy describes exactly what we
            collect, why we collect it, and what controls you have over it.
          </p>
        </>
      ),
    },
    {
      id: "information-we-collect",
      title: "Information we collect",
      body: (
        <>
          <h3>Account information</h3>
          <p>
            When you create an account, we collect your name, email address, and authentication
            identifier from Google Sign-In.
          </p>
          <h3>Purchase and claim data</h3>
          <ul>
            <li>Receipts you upload directly (PDF or image)</li>
            <li>Purchase confirmations detected from your Gmail when you connect it</li>
            <li>
              Extracted purchase details including merchant, product, price, purchase date, and
              order identifier
            </li>
            <li>Price history for items we monitor, captured from public product pages</li>
            <li>Claim drafts, outcomes, and any user-reported follow-up</li>
          </ul>
          <h3>Conversation history</h3>
          <p>
            Messages you exchange with the ClaimIt Assistant — both general support conversations
            and claim-focused threads — are stored to maintain context across sessions.
          </p>
          <h3>Technical data</h3>
          <ul>
            <li>IP address, browser user agent, and device type</li>
            <li>Server logs of API requests</li>
            <li>Diagnostic traces of AI agent runs for reliability and improvement</li>
          </ul>
        </>
      ),
    },
    {
      id: "gmail-connection",
      title: "Gmail connection",
      body: (
        <>
          <p>
            Connecting Gmail is optional. If you choose to connect, ClaimIt requests three OAuth
            scopes from Google:
          </p>
          <ul>
            <li>
              <strong>
                <code>gmail.readonly</code>
              </strong>{" "}
              — to read order confirmation emails for automatic purchase detection
            </li>
            <li>
              <strong>
                <code>gmail.send</code>
              </strong>{" "}
              — to send claim emails from your inbox when you approve them
            </li>
            <li>
              <strong>
                <code>gmail.modify</code>
              </strong>{" "}
              — to mark processed emails as read or apply organizational labels
            </li>
          </ul>
          <p>
            We use these scopes only for the stated purposes. We do not read emails unrelated to
            purchase detection, and we do not send any email without an action you have explicitly
            approved or that falls within an auto-send preference you have configured.
          </p>
          <p>
            You can disconnect Gmail at any time from your settings, which immediately revokes our
            access. You can also revoke access directly at{" "}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noopener noreferrer"
            >
              myaccount.google.com/permissions
            </a>
            .
          </p>
        </>
      ),
    },
    {
      id: "how-we-use-information",
      title: "How we use your information",
      body: (
        <>
          <p>We use the information we collect to:</p>
          <ul>
            <li>Detect purchases eligible for price-protection monitoring</li>
            <li>Monitor prices across supported platforms and identify drops</li>
            <li>Generate claim materials accurate to each platform&apos;s policy</li>
            <li>Send claim emails from your inbox when you have authorized us to do so</li>
            <li>Maintain Assistant conversation context across your sessions</li>
            <li>Provide customer support and respond to your requests</li>
            <li>Detect and prevent abuse, fraud, or security incidents</li>
            <li>Improve the reliability and quality of our AI agents</li>
          </ul>
          <p>
            We do not use your information to build advertising profiles, target advertisements, or
            sell to third parties.
          </p>
        </>
      ),
    },
    {
      id: "service-providers",
      title: "Service providers we use",
      body: (
        <>
          <p>
            ClaimIt is built on a small set of trusted infrastructure providers. Each receives only
            the data needed to perform its function.
          </p>
          <ul>
            <li>
              <strong>Google Cloud Platform</strong> — application hosting, file storage, and event
              coordination. Your receipts and price-evidence screenshots are stored in Google Cloud
              Storage in the United States.
            </li>
            <li>
              <strong>MongoDB Atlas</strong> — primary database for accounts, purchases, claims, and
              conversations. Hosted in the United States.
            </li>
            <li>
              <strong>Google Gemini</strong> — large language model for receipt extraction, claim
              drafting, and Assistant reasoning.
            </li>
            <li>
              <strong>Arize Phoenix</strong> — observability for AI agent traces, used to diagnose
              failures and improve quality.
            </li>
            <li>
              <strong>ScraperAPI, Apify, Amadeus, and Keepa</strong> — public price-data providers
              for monitored platforms. These services receive only product identifiers and platform
              URLs, never your personal information.
            </li>
          </ul>
          <p>We do not sell your personal information to any third party.</p>
        </>
      ),
    },
    {
      id: "data-storage-and-security",
      title: "Data storage and security",
      body: (
        <>
          <p>
            Your data is stored in encrypted form at rest and in transit. Connections to ClaimIt use
            TLS. Database and file storage encryption is managed by Google Cloud and MongoDB Atlas.
          </p>
          <p>
            Access to production data is restricted to authorized engineers and is logged.
            Credentials are managed through Google Cloud Secret Manager and our service accounts
            follow least-privilege IAM patterns.
          </p>
          <p>
            No system is perfectly secure. We work to protect your data but cannot guarantee
            absolute security.
          </p>
        </>
      ),
    },
    {
      id: "data-retention",
      title: "Data retention",
      body: (
        <>
          <p>We retain your account information for as long as your account is active.</p>
          <p>
            Purchase and claim data is retained to maintain your claim history. Receipts and
            price-evidence screenshots are retained for 365 days, after which they are automatically
            deleted.
          </p>
          <p>
            If you delete your account, we delete or anonymize your personal data within 30 days,
            except where retention is required for legal, accounting, or security reasons.
          </p>
        </>
      ),
    },
    {
      id: "your-rights",
      title: "Your rights and choices",
      body: (
        <>
          <p>You have control over your data:</p>
          <ul>
            <li>
              <strong>Access and export</strong> — request a copy of the data we hold about you
            </li>
            <li>
              <strong>Correction</strong> — update incorrect information from your settings
            </li>
            <li>
              <strong>Deletion</strong> — delete your account at any time from settings; this
              removes your personal data per the retention policy above
            </li>
            <li>
              <strong>Revoke Gmail access</strong> — disconnect Gmail from settings or revoke access
              directly at{" "}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
              >
                myaccount.google.com/permissions
              </a>
            </li>
            <li>
              <strong>Pause monitoring</strong> — stop price tracking for any purchase without
              deleting it
            </li>
          </ul>
          <p>
            Depending on your location, you may have additional rights under laws such as the
            California Consumer Privacy Act (CCPA). <Link href="/help/contact">Contact us</Link> to
            exercise any of these rights.
          </p>
        </>
      ),
    },
    {
      id: "cookies",
      title: "Cookies and similar technologies",
      body: (
        <>
          <p>We use a small number of cookies and similar technologies:</p>
          <ul>
            <li>
              <strong>Authentication cookies</strong> to keep you signed in
            </li>
            <li>
              <strong>Functional cookies</strong> to remember your preferences such as theme
              selection
            </li>
          </ul>
          <p>
            We do not use third-party advertising cookies, cross-site tracking pixels, or behavioral
            targeting tools.
          </p>
        </>
      ),
    },
    {
      id: "childrens-privacy",
      title: "Children's privacy",
      body: (
        <p>
          ClaimIt is not directed to children under 18. We do not knowingly collect personal
          information from anyone under 18. If you believe a child has provided us information,
          please <Link href="/help/contact">contact us</Link> and we will delete it.
        </p>
      ),
    },
    {
      id: "changes",
      title: "Changes to this policy",
      body: (
        <p>
          We may update this Privacy Policy from time to time. When we do, we will update the
          &quot;Last updated&quot; date at the top of this page. For material changes, we will
          notify you by email or through the product before the changes take effect.
        </p>
      ),
    },
    {
      id: "contact",
      title: "Contact us",
      body: (
        <p>
          For questions or requests about this policy, visit our{" "}
          <Link href="/help/contact">contact page</Link> and we will respond.
        </p>
      ),
    },
  ],
};
