"use client";

import { CircleDashed, Inbox, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";
import { Badge } from "@/components/ui/badge";

const gmailColumns = [
  {
    title: "Optional",
    icon: CircleDashed,
    body: "Gmail is optional. Skip this step and add receipts manually anytime.",
  },
  {
    title: "When connected",
    icon: Inbox,
    body: "ClaimIt reads purchase-related emails only. We surface confirmation receipts and ignore everything else.",
  },
  {
    title: "What we don't do",
    icon: ShieldCheck,
    body: "We never read non-purchase emails, never sell data, and never send claims without your approval.",
  },
] as const;

export function GmailAccessSection() {
  return (
    <section>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-28"
      >
        <div className="max-w-3xl">
          <Badge variant="secondary" className="mb-4">
            Gmail Access
          </Badge>
          <h2 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            How we use Gmail access
          </h2>
        </div>
        <div className="mt-10 grid gap-8 sm:grid-cols-3">
          {gmailColumns.map((column) => (
            <div key={column.title}>
              <div className="flex size-10 items-center justify-center rounded-lg bg-secondary">
                <column.icon className="size-5 text-foreground" aria-hidden />
              </div>
              <h3 className="mt-4 text-base font-medium text-foreground">{column.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{column.body}</p>
            </div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
