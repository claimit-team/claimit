"use client";

import { ArrowRight, FileText, Mail, Shield } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const privacySections = [
  { id: "overview", title: "Overview" },
  { id: "information-we-collect", title: "Information we collect" },
  { id: "gmail-connection", title: "Gmail connection" },
  { id: "receipts-and-claim-materials", title: "Receipts and claim materials" },
  { id: "how-we-use-information", title: "How we use information" },
  { id: "user-reported-outcomes", title: "User-reported outcomes" },
  { id: "data-storage-and-security", title: "Data storage and security" },
  { id: "sharing-and-service-providers", title: "Sharing and service providers" },
  { id: "your-choices", title: "Your choices" },
  { id: "data-retention", title: "Data retention" },
  { id: "childrens-privacy", title: "Children's privacy" },
  { id: "changes-to-this-policy", title: "Changes to this policy" },
  { id: "contact", title: "Contact" },
];

function TableOfContents({
  activeSection,
  onSelect,
}: {
  activeSection: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav className="space-y-1">
      {privacySections.map((section) => (
        <a
          key={section.id}
          href={`#${section.id}`}
          onClick={(e) => {
            e.preventDefault();
            onSelect(section.id);
          }}
          className={`block rounded-md px-3 py-2 text-sm transition-colors ${
            activeSection === section.id
              ? "bg-neutral-100 font-medium text-neutral-900"
              : "text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900"
          }`}
        >
          {section.title}
        </a>
      ))}
    </nav>
  );
}

function MobileTableOfContents({
  activeSection,
  onSelect,
}: {
  activeSection: string;
  onSelect: (id: string) => void;
}) {
  return (
    <Select value={activeSection} onValueChange={(v) => v && onSelect(v)}>
      <SelectTrigger className="w-full border-neutral-200 bg-neutral-0 text-neutral-900">
        <SelectValue placeholder="Jump to section" />
      </SelectTrigger>
      <SelectContent className="bg-neutral-0">
        {privacySections.map((section) => (
          <SelectItem key={section.id} value={section.id} className="text-neutral-700">
            {section.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PolicySection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="mb-4 text-xl font-semibold text-neutral-900">{title}</h2>
      <div className="space-y-4 text-neutral-700 [&_a]:text-brand-primary-500 [&_a]:no-underline hover:[&_a]:underline [&_li]:ml-5 [&_li]:list-disc [&_p]:leading-relaxed [&_strong]:font-semibold [&_strong]:text-neutral-900 [&_ul]:space-y-2">
        {children}
      </div>
    </section>
  );
}

export function PrivacyPolicyView() {
  const [activeSection, setActiveSection] = useState("overview");

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: "-100px 0px -80% 0px" },
    );

    privacySections.forEach((section) => {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div className="bg-neutral-0">
      {/* Header */}
      <div className="border-b border-neutral-200 bg-neutral-0">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-balance text-4xl font-bold leading-[1.05] tracking-tight text-neutral-900 sm:text-5xl">
              Privacy Policy
            </h1>
            <Badge variant="secondary" className="bg-neutral-100 text-neutral-700">
              MVP placeholder legal text
            </Badge>
          </div>
          <p className="mt-4 max-w-3xl text-lg leading-relaxed text-neutral-700">
            How ClaimIt handles purchase-related data, account information, Gmail access, claim
            materials, and user-reported outcomes.
          </p>
          <p className="mt-3 text-sm text-neutral-500">Last updated: May 13, 2026</p>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Mobile TOC */}
        <div className="mb-8 lg:hidden">
          <MobileTableOfContents activeSection={activeSection} onSelect={scrollToSection} />
        </div>

        <div className="lg:grid lg:grid-cols-[240px_1fr] lg:gap-12 xl:grid-cols-[280px_1fr]">
          {/* Desktop TOC */}
          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <h3 className="mb-4 text-sm font-semibold text-neutral-900">On this page</h3>
              <TableOfContents activeSection={activeSection} onSelect={scrollToSection} />
            </div>
          </aside>

          {/* Main Content */}
          <div className="space-y-12">
            <PolicySection id="overview" title="Overview">
              <p>
                ClaimIt is an AI agent system that helps users monitor supported price protection
                windows after purchases and prepare claim materials for potential refunds. This
                Privacy Policy describes how we handle your data in the MVP version of our service.
              </p>
              <p>
                We are committed to being transparent about the data we collect and how we use it.
                This policy applies to all users of ClaimIt&apos;s services, including our website
                and AI-powered assistant.
              </p>
            </PolicySection>

            <PolicySection id="information-we-collect" title="Information we collect">
              <p>We collect and process the following categories of information:</p>
              <ul>
                <li>
                  <strong>Account information:</strong> Name and email address you provide when
                  creating an account.
                </li>
                <li>
                  <strong>Purchase information:</strong> Details from uploaded receipts or Gmail
                  order confirmations, including retailer names, purchase dates, items, and prices.
                </li>
                <li>
                  <strong>Claim information:</strong> Claim drafts, claim type, submission status,
                  and user-reported outcomes (approved, denied, or no response).
                </li>
                <li>
                  <strong>Conversation information:</strong> Your interactions with the ClaimIt
                  Assistant, including questions and requests.
                </li>
                <li>
                  <strong>Technical usage information:</strong> Basic data needed to operate the
                  service, such as device type, browser information, and access times.
                </li>
              </ul>
              <p>
                We do not collect advertising identifiers or engage in unrelated behavioral
                tracking.
              </p>
            </PolicySection>

            <PolicySection id="gmail-connection" title="Gmail connection">
              <p>
                Connecting your Gmail account to ClaimIt is optional. If you choose to connect, we
                may use Gmail access for:
              </p>
              <ul>
                <li>
                  <strong>Order confirmation ingestion:</strong> Scanning your inbox for order
                  confirmations to automatically identify purchases with price protection windows.
                </li>
                <li>
                  <strong>Approved email claim sending:</strong> Sending claim emails on your behalf
                  when you explicitly approve them.
                </li>
              </ul>
              <p>
                ClaimIt does not store your Gmail password. We use OAuth-based authentication
                provided by Google. You can disconnect your Gmail account at any time through your
                account settings.
              </p>
              <p>
                In plain terms, we request permission to read your email messages (to find order
                confirmations) and send email on your behalf (when you approve a claim submission).
              </p>
            </PolicySection>

            <PolicySection id="receipts-and-claim-materials" title="Receipts and claim materials">
              <p>
                When you upload receipts or evidence screenshots, we store these files to support
                your claim review process. Claim drafts prepared by ClaimIt may include:
              </p>
              <ul>
                <li>Order details such as item names, prices, and purchase dates</li>
                <li>Platform or retailer name</li>
                <li>References to applicable price protection policies</li>
                <li>Information you provide about price drops or promotions</li>
              </ul>
              <p>
                This information is used solely to help you prepare and submit claims for potential
                refunds.
              </p>
            </PolicySection>

            <PolicySection id="how-we-use-information" title="How we use information">
              <p>We use the information we collect to:</p>
              <ul>
                <li>Provide the monitoring workflow for your price protection windows</li>
                <li>Prepare claim materials and draft communications</li>
                <li>Support the Assistant in providing explanations and guidance</li>
                <li>Improve service reliability and debug issues</li>
                <li>Communicate service-related updates and important notices</li>
              </ul>
              <p>We do not sell your personal information to third parties.</p>
            </PolicySection>

            <PolicySection id="user-reported-outcomes" title="User-reported outcomes">
              <p>
                <strong>Important:</strong> Claim outcomes (approved, denied, or no response) are
                typically reported by users, not automatically verified by ClaimIt.
              </p>
              <p>
                Because claim resolutions often occur through external channels (such as credit card
                statements, retailer communications, or bank transactions), ClaimIt relies on what
                you tell us about the outcome of your claims.
              </p>
              <p>
                Any &quot;reclaimed&quot; or refund totals displayed in your account are based on
                amounts you report, not automatically verified bank deposits or credit card credits.
                We encourage accurate reporting, but we cannot independently confirm these figures.
              </p>
            </PolicySection>

            <PolicySection id="data-storage-and-security" title="Data storage and security">
              <p>
                ClaimIt uses cloud infrastructure and managed database storage to securely store
                your information. We implement industry-standard security measures to protect your
                data from unauthorized access, alteration, disclosure, or destruction.
              </p>
              <p>
                For more details about our security practices, please visit our{" "}
                <Link href="/security" className="text-brand-primary-500 hover:underline">
                  Security page
                </Link>
                .
              </p>
              <p>
                We do not currently claim SOC 2, ISO, HIPAA, PCI, or other compliance
                certifications.
              </p>
            </PolicySection>

            <PolicySection id="sharing-and-service-providers" title="Sharing and service providers">
              <p>
                We may share information with service providers who assist us in operating ClaimIt.
                These providers fall into the following categories:
              </p>
              <ul>
                <li>Cloud hosting providers</li>
                <li>Database providers</li>
                <li>Email and OAuth providers</li>
                <li>Observability and monitoring tools</li>
              </ul>
              <p>
                We require our service providers to protect your information and use it only for the
                purposes we specify.
              </p>
            </PolicySection>

            <PolicySection id="your-choices" title="Your choices">
              <p>You have the following choices regarding your data and how ClaimIt operates:</p>
              <ul>
                <li>
                  <strong>Disconnect Gmail:</strong> Remove Gmail integration at any time through
                  your account settings.
                </li>
                <li>
                  <strong>Use manual upload:</strong> Choose to manually upload receipts instead of
                  connecting email.
                </li>
                <li>
                  <strong>Change send preferences:</strong> Control whether ClaimIt can send emails
                  on your behalf.
                </li>
                <li>
                  <strong>Manage notifications:</strong> Adjust your notification preferences for
                  alerts and updates.
                </li>
                <li>
                  <strong>Request account support:</strong> Contact us through our{" "}
                  <Link href="/help/contact" className="text-brand-primary-500 hover:underline">
                    contact page
                  </Link>{" "}
                  for assistance with your account.
                </li>
              </ul>
            </PolicySection>

            <PolicySection id="data-retention" title="Data retention">
              <p>
                We retain information as long as needed to provide the service, comply with legal
                obligations, resolve disputes, or maintain auditability. When you delete your
                account, we will delete or anonymize your information, except where retention is
                required by law.
              </p>
            </PolicySection>

            <PolicySection id="childrens-privacy" title="Children's privacy">
              <p>
                ClaimIt is not intended for children under 13 years of age. We do not knowingly
                collect personal information from children under 13. If you believe we have
                collected information from a child under 13, please{" "}
                <Link href="/help/contact" className="text-brand-primary-500 hover:underline">
                  contact us
                </Link>{" "}
                so we can take appropriate action.
              </p>
            </PolicySection>

            <PolicySection id="changes-to-this-policy" title="Changes to this policy">
              <p>
                We may update this Privacy Policy from time to time. If we make material changes, we
                will notify you by updating the &quot;Last updated&quot; date at the top of this
                page and, if appropriate, through email or in-app notification.
              </p>
              <p>
                We encourage you to review this policy periodically to stay informed about how we
                protect your information.
              </p>
            </PolicySection>

            <PolicySection id="contact" title="Contact">
              <p>
                If you have questions about this Privacy Policy or our data practices, please
                contact us through our{" "}
                <Link href="/help/contact" className="text-brand-primary-500 hover:underline">
                  contact page
                </Link>
                .
              </p>
            </PolicySection>

            {/* Related Links */}
            <div className="border-t border-neutral-200 pt-12">
              <h2 className="mb-6 text-xl font-semibold text-neutral-900">Related pages</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Link href="/security">
                  <Card className="group h-full border-neutral-200 bg-neutral-0 transition-colors hover:border-neutral-300">
                    <CardContent className="flex items-start gap-4 p-5">
                      <div className="rounded-lg bg-neutral-100 p-2.5">
                        <Shield className="h-5 w-5 text-neutral-700" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-medium text-neutral-900 group-hover:text-brand-primary-500">
                          Security & Privacy
                        </h3>
                        <p className="mt-1 text-sm text-neutral-500">
                          Learn about our security practices
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-neutral-400 transition-transform group-hover:translate-x-1 group-hover:text-brand-primary-500" />
                    </CardContent>
                  </Card>
                </Link>

                <Link href="/terms">
                  <Card className="group h-full border-neutral-200 bg-neutral-0 transition-colors hover:border-neutral-300">
                    <CardContent className="flex items-start gap-4 p-5">
                      <div className="rounded-lg bg-neutral-100 p-2.5">
                        <FileText className="h-5 w-5 text-neutral-700" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-medium text-neutral-900 group-hover:text-brand-primary-500">
                          Terms of Service
                        </h3>
                        <p className="mt-1 text-sm text-neutral-500">
                          Review our terms and conditions
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-neutral-400 transition-transform group-hover:translate-x-1 group-hover:text-brand-primary-500" />
                    </CardContent>
                  </Card>
                </Link>

                <Link href="/help/contact">
                  <Card className="group h-full border-neutral-200 bg-neutral-0 transition-colors hover:border-neutral-300">
                    <CardContent className="flex items-start gap-4 p-5">
                      <div className="rounded-lg bg-neutral-100 p-2.5">
                        <Mail className="h-5 w-5 text-neutral-700" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-medium text-neutral-900 group-hover:text-brand-primary-500">
                          Contact support
                        </h3>
                        <p className="mt-1 text-sm text-neutral-500">
                          Get help with questions or concerns
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-neutral-400 transition-transform group-hover:translate-x-1 group-hover:text-brand-primary-500" />
                    </CardContent>
                  </Card>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
