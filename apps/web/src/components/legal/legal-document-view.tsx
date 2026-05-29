"use client";

import { ArrowLeft } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";

export type LegalSection = {
  id: string;
  title: string;
  body: ReactNode;
};

export type LegalDocumentContent = {
  title: string;
  description: string;
  lastUpdated: string;
  sections: LegalSection[];
};

const PROSE_CLASSES = [
  "text-base leading-relaxed text-neutral-700",
  "[&_p]:my-4 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
  "[&_h3]:mt-8 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-neutral-900",
  "[&_ul]:my-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6 [&_ul]:marker:text-neutral-400",
  "[&_a]:text-brand-primary-500 [&_a]:underline-offset-4",
  "[&_a:hover]:text-brand-primary-600 [&_a:hover]:underline",
  "[&_strong]:font-semibold [&_strong]:text-neutral-900",
  "[&_code]:rounded [&_code]:bg-neutral-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-sm [&_code]:font-mono",
].join(" ");

export function LegalDocumentView({
  title,
  description,
  lastUpdated,
  sections,
}: LegalDocumentContent) {
  return (
    <div className="min-h-screen bg-neutral-0">
      {/* Back link */}
      <div className="mx-auto max-w-3xl px-4 pt-8 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="inline-flex items-center text-sm font-medium text-neutral-600 transition-colors hover:text-brand-primary-600"
        >
          <ArrowLeft className="mr-1.5 size-4" aria-hidden />
          Back to home
        </Link>
      </div>

      {/* Hero — left-aligned, content-doc rhythm */}
      <section className="py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight text-neutral-900 sm:text-5xl lg:text-6xl">
              {title}
            </h1>
            <p className="mt-6 text-balance text-base leading-relaxed text-neutral-700 sm:text-lg">
              {description}
            </p>
            <p className="mt-6 text-sm font-medium text-neutral-500">Last updated: {lastUpdated}</p>
          </motion.div>
        </div>
      </section>

      {/* Inline TOC */}
      <section className="border-t border-neutral-200 py-8 sm:py-10">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <p className="text-sm font-medium text-neutral-500">On this page</p>
          <ul className="mt-4 list-disc space-y-2 pl-6 text-base leading-relaxed text-neutral-700 marker:text-neutral-400">
            {sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="text-brand-primary-500 underline-offset-4 transition-colors hover:text-brand-primary-600 hover:underline"
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Sections */}
      {sections.map((section) => (
        <section
          key={section.id}
          id={section.id}
          className="scroll-mt-24 border-t border-neutral-200 py-12 sm:py-16"
        >
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-balance text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
              {section.title}
            </h2>
            <div className={`mt-6 ${PROSE_CLASSES}`}>{section.body}</div>
          </div>
        </section>
      ))}
    </div>
  );
}
