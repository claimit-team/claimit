import Link from "next/link";

export function TermsContent() {
  return (
    <article className="max-w-none">
      {/* Acceptance of Terms */}
      <section id="acceptance">
        <h2 className="text-2xl font-semibold text-neutral-900 mt-10 mb-4 pt-4 first:mt-0">
          1. Acceptance of terms
        </h2>
        <p className="text-neutral-700 leading-7 mb-4">
          By accessing or using ClaimIt (&quot;the Service&quot;), you agree to be bound by these
          Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms, you may not use
          the Service. Your continued use of the Service following any updates to these Terms
          constitutes acceptance of those changes.
        </p>
      </section>

      {/* Service Description */}
      <section id="service-description">
        <h2 className="text-2xl font-semibold text-neutral-900 mt-10 mb-4 pt-4">
          2. Service description
        </h2>
        <p className="text-neutral-700 leading-7 mb-4">
          ClaimIt is an AI-powered service that assists users with price protection claims. The
          Service provides the following capabilities:
        </p>
        <ul className="text-neutral-700 mb-4 pl-6 list-disc space-y-2">
          <li>Adding purchase records through manual upload or Gmail connection</li>
          <li>Monitoring supported price protection windows for eligible purchases</li>
          <li>
            Preparing claim materials including email drafts, chat scripts, in-store guides, and
            self-service walkthroughs
          </li>
          <li>Assistant support for explanations and refinements of claim materials</li>
        </ul>
        <p className="text-neutral-700 leading-7 mb-4">
          <strong>Important:</strong> ClaimIt does not guarantee that any claim will be approved or
          result in a refund. Approval decisions are made solely by retailers, airlines, hotels, and
          other third-party platforms. ClaimIt is a preparation and monitoring tool only.
        </p>
      </section>

      {/* Account and Eligibility */}
      <section id="account-eligibility">
        <h2 className="text-2xl font-semibold text-neutral-900 mt-10 mb-4 pt-4">
          3. Account and eligibility
        </h2>
        <p className="text-neutral-700 leading-7 mb-4">
          To use ClaimIt, you must create an account with valid contact information. You are
          responsible for maintaining the confidentiality of your account credentials and for all
          activities under your account.
        </p>
        <p className="text-neutral-700 leading-7 mb-4">
          The current MVP version of ClaimIt supports single-user accounts. Each account is intended
          for personal use by one individual.
        </p>
      </section>

      {/* Gmail Connection */}
      <section id="gmail-connection">
        <h2 className="text-2xl font-semibold text-neutral-900 mt-10 mb-4 pt-4">
          4. Gmail connection and user authorization
        </h2>
        <p className="text-neutral-700 leading-7 mb-4">
          Gmail connection is optional. If you choose to connect your Gmail account, you authorize
          ClaimIt to:
        </p>
        <ul className="text-neutral-700 mb-4 pl-6 list-disc space-y-2">
          <li>Access Gmail scopes necessary for purchase receipt ingestion</li>
          <li>Send email claims on your behalf when you approve them or configure auto-send</li>
        </ul>
        <p className="text-neutral-700 leading-7 mb-4">
          You may disconnect your Gmail account at any time through the ClaimIt settings. Email
          claims are sent from your connected Gmail account only according to your explicit approval
          or your configured auto-send settings.
        </p>
      </section>

      {/* User Responsibilities */}
      <section id="user-responsibilities">
        <h2 className="text-2xl font-semibold text-neutral-900 mt-10 mb-4 pt-4">
          5. User responsibilities
        </h2>
        <p className="text-neutral-700 leading-7 mb-4">
          As a user of ClaimIt, you are responsible for:
        </p>
        <ul className="text-neutral-700 mb-4 pl-6 list-disc space-y-2">
          <li>Reviewing all claim materials before submission</li>
          <li>Confirming the accuracy of extracted purchase details</li>
          <li>Not submitting false, misleading, or fraudulent claim information</li>
          <li>Completing external claim workflows manually where required</li>
          <li>Complying with all applicable laws and the terms of third-party platforms</li>
        </ul>
      </section>

      {/* Claim Materials and No Guarantee */}
      <section id="claim-materials">
        <h2 className="text-2xl font-semibold text-neutral-900 mt-10 mb-4 pt-4">
          6. Claim materials and no guarantee
        </h2>
        <p className="text-neutral-700 leading-7 mb-4">
          <strong>This section is critical to understanding the Service.</strong>
        </p>
        <p className="text-neutral-700 leading-7 mb-4">
          ClaimIt prepares claim materials based on available purchase records, retailer policies,
          and current price information. However:
        </p>
        <ul className="text-neutral-700 mb-4 pl-6 list-disc space-y-2">
          <li>
            <strong>ClaimIt does not guarantee</strong> that any retailer, airline, hotel, or other
            platform will approve your claim
          </li>
          <li>
            Platform policies, price protection terms, and eligibility criteria may change at any
            time without notice
          </li>
          <li>
            The accuracy of prepared materials depends on the quality of information you provide and
            publicly available data
          </li>
          <li>
            You are responsible for final submission and any required manual actions in external
            claim workflows
          </li>
        </ul>
        <p className="text-neutral-700 leading-7 mb-4">
          ClaimIt provides preparation assistance only. All claim outcomes are determined by
          third-party platforms and are outside the control of ClaimIt.
        </p>
      </section>

      {/* Approval and Auto-Send Preferences */}
      <section id="approval-auto-send">
        <h2 className="text-2xl font-semibold text-neutral-900 mt-10 mb-4 pt-4">
          7. Approval and auto-send preferences
        </h2>
        <p className="text-neutral-700 leading-7 mb-4">
          By default, ClaimIt operates in approval-gated mode, meaning all claim actions require
          your explicit approval before execution.
        </p>
        <p className="text-neutral-700 leading-7 mb-4">Auto-send functionality:</p>
        <ul className="text-neutral-700 mb-4 pl-6 list-disc space-y-2">
          <li>
            Auto-send applies only to eligible email-based claims if you explicitly configure it
          </li>
          <li>
            Chat scripts, in-store guides, and self-service walkthroughs always require manual user
            action
          </li>
          <li>You may cancel or modify pending claims according to the available user interface</li>
          <li>You can disable auto-send at any time in your account settings</li>
        </ul>
      </section>

      {/* User-Reported Outcomes */}
      <section id="user-reported-outcomes">
        <h2 className="text-2xl font-semibold text-neutral-900 mt-10 mb-4 pt-4">
          8. User-reported outcomes
        </h2>
        <p className="text-neutral-700 leading-7 mb-4">
          Many claims resolve through external channels such as retailer customer service portals,
          phone calls, or in-store interactions. Because ClaimIt cannot automatically verify these
          outcomes:
        </p>
        <ul className="text-neutral-700 mb-4 pl-6 list-disc space-y-2">
          <li>
            You may mark claim outcomes as approved, denied, or no response through the ClaimIt
            interface
          </li>
          <li>
            Reclaimed totals displayed in your account are based on user-reported approved outcomes
          </li>
          <li>ClaimIt does not independently verify reported amounts or outcomes</li>
        </ul>
      </section>

      {/* Subscriptions and Trials */}
      <section id="subscriptions">
        <h2 className="text-2xl font-semibold text-neutral-900 mt-10 mb-4 pt-4">
          9. Subscriptions and trials
        </h2>
        <p className="text-neutral-700 leading-7 mb-4">ClaimIt offers the following plans:</p>
        <ul className="text-neutral-700 mb-4 pl-6 list-disc space-y-2">
          <li>
            <strong>Free tier:</strong> A permanent free plan with usage limits
          </li>
          <li>
            <strong>Pro and Family plans:</strong> Paid subscriptions that may include a 30-day
            trial period
          </li>
        </ul>
        <p className="text-neutral-700 leading-7 mb-4">
          For complete pricing details, visit the{" "}
          <Link href="/pricing" className="text-brand-primary-500 hover:underline">
            Pricing page
          </Link>
          . Payment terms and billing details will be provided during the subscription process.
        </p>
      </section>

      {/* Prohibited Use */}
      <section id="prohibited-use">
        <h2 className="text-2xl font-semibold text-neutral-900 mt-10 mb-4 pt-4">
          10. Prohibited use
        </h2>
        <p className="text-neutral-700 leading-7 mb-4">You agree not to use ClaimIt to:</p>
        <ul className="text-neutral-700 mb-4 pl-6 list-disc space-y-2">
          <li>Submit false, fraudulent, or misleading claims</li>
          <li>Attempt to bypass or circumvent retailer or platform policies</li>
          <li>Interfere with, disrupt, or damage ClaimIt systems or infrastructure</li>
          <li>Access or attempt to access other users&apos; accounts or data</li>
          <li>Use automated systems to abuse the Service</li>
          <li>Violate any applicable laws or regulations</li>
        </ul>
      </section>

      {/* Third-Party Services */}
      <section id="third-party-services">
        <h2 className="text-2xl font-semibold text-neutral-900 mt-10 mb-4 pt-4">
          11. Third-party services
        </h2>
        <p className="text-neutral-700 leading-7 mb-4">
          ClaimIt integrates with and relies upon various third-party services, which may include:
        </p>
        <ul className="text-neutral-700 mb-4 pl-6 list-disc space-y-2">
          <li>Gmail and other email providers for purchase ingestion and claim sending</li>
          <li>Supported retailers, airlines, and hotels for price protection claims</li>
          <li>Cloud infrastructure and database providers</li>
          <li>Observability and monitoring services</li>
        </ul>
        <p className="text-neutral-700 leading-7 mb-4">
          Your use of ClaimIt may be subject to the terms and policies of these third-party
          services. ClaimIt is not responsible for the availability, accuracy, or policies of
          third-party platforms.
        </p>
      </section>

      {/* Disclaimers */}
      <section id="disclaimers">
        <h2 className="text-2xl font-semibold text-neutral-900 mt-10 mb-4 pt-4">12. Disclaimers</h2>
        <p className="text-neutral-700 leading-7 mb-4">
          THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES
          OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF
          MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
        </p>
        <p className="text-neutral-700 leading-7 mb-4">
          ClaimIt does not warrant that the Service will be uninterrupted, error-free, or secure.
          ClaimIt does not warrant the accuracy of any information, pricing data, or claim materials
          generated by the Service.
        </p>
      </section>

      {/* Limitation of Liability */}
      <section id="limitation-of-liability">
        <h2 className="text-2xl font-semibold text-neutral-900 mt-10 mb-4 pt-4">
          13. Limitation of liability
        </h2>
        <p className="text-neutral-700 leading-7 mb-4">
          TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, CLAIMIT AND ITS AFFILIATES, OFFICERS,
          DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
          SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING OUT OF OR RELATED TO YOUR USE OF THE
          SERVICE.
        </p>
        <p className="text-neutral-700 leading-7 mb-4">
          IN NO EVENT SHALL CLAIMIT&apos;S TOTAL LIABILITY EXCEED THE AMOUNTS YOU HAVE PAID TO
          CLAIMIT IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM, OR ONE HUNDRED DOLLARS ($100),
          WHICHEVER IS GREATER.
        </p>
      </section>

      {/* Termination */}
      <section id="termination">
        <h2 className="text-2xl font-semibold text-neutral-900 mt-10 mb-4 pt-4">14. Termination</h2>
        <p className="text-neutral-700 leading-7 mb-4">
          You may terminate your account at any time by contacting support or using the account
          deletion feature in settings.
        </p>
        <p className="text-neutral-700 leading-7 mb-4">
          ClaimIt reserves the right to suspend or terminate your access to the Service at any time,
          with or without cause, and with or without notice. Upon termination, your right to use the
          Service will immediately cease.
        </p>
      </section>

      {/* Changes to Terms */}
      <section id="changes-to-terms">
        <h2 className="text-2xl font-semibold text-neutral-900 mt-10 mb-4 pt-4">
          15. Changes to terms
        </h2>
        <p className="text-neutral-700 leading-7 mb-4">
          ClaimIt may update these Terms from time to time. When we make material changes, we will
          notify you by updating the &quot;Last updated&quot; date at the top of this page and,
          where appropriate, providing additional notice through the Service or via email.
        </p>
        <p className="text-neutral-700 leading-7 mb-4">
          Your continued use of the Service after any changes constitutes acceptance of the updated
          Terms.
        </p>
      </section>

      {/* Contact */}
      <section id="contact">
        <h2 className="text-2xl font-semibold text-neutral-900 mt-10 mb-4 pt-4">16. Contact</h2>
        <p className="text-neutral-700 leading-7 mb-4">
          If you have questions about these Terms of Service, please contact us through our{" "}
          <Link href="/help/contact" className="text-brand-primary-500 hover:underline">
            Contact page
          </Link>
          .
        </p>
      </section>
    </article>
  );
}
