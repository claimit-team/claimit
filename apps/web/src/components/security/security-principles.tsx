"use client";

import { Eye, LockKeyhole, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";
import { Badge } from "@/components/ui/badge";

const principles = [
  {
    title: "Least access",
    body: "ClaimIt asks for the Gmail scopes needed for receipt ingestion and eligible email claim sending.",
    icon: LockKeyhole,
  },
  {
    title: "User approval by default",
    body: "Approval-gated mode is default. You review and approve claims before they are sent.",
    icon: ShieldCheck,
  },
  {
    title: "Transparent workflows",
    body: "Users can review claim drafts, policy evidence, and Assistant explanations at every step.",
    icon: Eye,
  },
] as const;

export function SecurityPrinciples() {
  return (
    <section>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24"
      >
        <div className="max-w-3xl">
          <Badge variant="secondary" className="mb-4">
            Principles
          </Badge>
          <h2 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            How we approach security
          </h2>
        </div>
        <div className="mt-10 grid gap-8 sm:grid-cols-3">
          {principles.map((principle) => (
            <div key={principle.title}>
              <div className="flex size-10 items-center justify-center rounded-lg bg-secondary">
                <principle.icon className="size-5 text-foreground" aria-hidden />
              </div>
              <h3 className="mt-4 text-base font-medium text-foreground">{principle.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{principle.body}</p>
            </div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
