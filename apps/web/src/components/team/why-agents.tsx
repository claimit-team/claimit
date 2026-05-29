"use client";

import { FileText, GitBranch, ListChecks } from "lucide-react";
import { motion } from "motion/react";

const agentReasons = [
  {
    title: "Receipts are unstructured",
    description:
      "Email confirmations, PDFs, and retailer formats vary widely. The Ingest Agent handles receipt extraction across diverse formats.",
    icon: FileText,
  },
  {
    title: "Policies are fragmented",
    description:
      "Each retailer and card issuer has different price protection windows and rules. The Monitor Agent handles policy-aware checks.",
    icon: GitBranch,
  },
  {
    title: "Claims require follow-through",
    description:
      "Preparing materials and submitting claims takes time. The Claim Agent and Assistant help users review and act.",
    icon: ListChecks,
  },
] as const;

export function WhyAgents() {
  return (
    <section className="bg-neutral-0 py-16 sm:py-20 lg:py-28">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8"
      >
        <div className="text-center">
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
            Why this product needs agents
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-balance text-neutral-700">
            The complexity of price protection makes agent-based automation the right approach.
          </p>
        </div>

        <div className="mt-12 grid gap-8 sm:grid-cols-3">
          {agentReasons.map((reason) => (
            <div key={reason.title}>
              <div className="flex size-10 items-center justify-center rounded-lg bg-neutral-100">
                <reason.icon className="size-5 text-neutral-700" aria-hidden />
              </div>
              <h3 className="mt-4 text-base font-medium text-neutral-900">{reason.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">{reason.description}</p>
            </div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
