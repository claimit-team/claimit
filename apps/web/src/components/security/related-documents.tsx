"use client";

import { FileText, HelpCircle, Mail, Scale } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

const documents = [
  {
    title: "Privacy Policy",
    description: "How we collect, use, and protect your information.",
    icon: FileText,
    href: "/privacy",
  },
  {
    title: "Terms of Service",
    description: "The agreement governing your use of ClaimIt.",
    icon: Scale,
    href: "/terms",
  },
  {
    title: "Help Center",
    description: "Answers to common questions about ClaimIt.",
    icon: HelpCircle,
    href: "/help",
  },
  {
    title: "Contact Us",
    description: "Get in touch with our support team.",
    icon: Mail,
    href: "/help/contact",
  },
];

export function RelatedDocuments() {
  return (
    <section>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-28"
      >
        <div className="mb-12">
          <Badge variant="secondary" className="mb-4">
            Resources
          </Badge>
          <h2 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Related documents
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {documents.map((doc) => (
            <Link
              key={doc.href}
              href={doc.href}
              className="group flex h-full flex-col rounded-lg border border-border bg-card p-6 transition-colors hover:bg-accent/50"
            >
              <div className="flex size-10 items-center justify-center rounded-lg bg-secondary">
                <doc.icon className="size-5 text-foreground" />
              </div>
              <h3 className="mt-4 font-medium text-foreground transition-colors group-hover:text-primary">
                {doc.title}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">{doc.description}</p>
            </Link>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
