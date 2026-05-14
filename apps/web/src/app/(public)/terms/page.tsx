import { FileText, HelpCircle, Mail, Shield } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { TermsContent } from "@/components/terms/terms-content";
import { TermsTableOfContents } from "@/components/terms/terms-table-of-contents";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Terms of Service — ClaimIt",
  description: "The terms that govern use of the ClaimIt MVP service.",
};

const relatedLinks = [
  {
    title: "Privacy Policy",
    href: "/privacy",
    icon: FileText,
    description: "How we handle your data",
  },
  {
    title: "Security",
    href: "/security",
    icon: Shield,
    description: "Our security practices",
  },
  {
    title: "Help",
    href: "/help",
    icon: HelpCircle,
    description: "Get support and answers",
  },
  {
    title: "Contact",
    href: "/help/contact",
    icon: Mail,
    description: "Reach out to our team",
  },
];

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-neutral-0">
      <section className="border-b border-neutral-200 bg-neutral-50 py-12 md:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <Badge
              variant="outline"
              className="mb-4 border-neutral-300 bg-neutral-100 text-neutral-700"
            >
              MVP placeholder legal text
            </Badge>
            <h1 className="text-balance text-4xl font-bold leading-[1.05] tracking-tight text-neutral-900 sm:text-5xl">
              Terms of Service
            </h1>
            <p className="mt-4 text-lg text-neutral-700">
              The terms that govern use of the ClaimIt MVP service.
            </p>
            <p className="mt-2 text-sm text-neutral-500">Last updated: May 13, 2026</p>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-[280px_1fr] lg:gap-12">
            <TermsTableOfContents />
            <TermsContent />
          </div>
        </div>
      </section>

      <section className="border-t border-neutral-200 bg-neutral-50 py-12 md:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-8 text-center text-2xl font-semibold text-neutral-900">
            Related Resources
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {relatedLinks.map((link) => (
              <Link key={link.href} href={link.href}>
                <Card className="h-full border-neutral-200 bg-neutral-0 transition-colors hover:border-neutral-300">
                  <CardHeader className="pb-2">
                    <link.icon className="h-5 w-5 text-brand-primary-500" />
                    <CardTitle className="text-base text-neutral-900">{link.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-neutral-700">{link.description}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
