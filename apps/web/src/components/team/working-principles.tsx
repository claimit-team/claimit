"use client";

import { CheckCircle, Compass, Eye, ShieldCheck, Workflow } from "lucide-react";
import { motion } from "motion/react";

const principles = [
  {
    title: "User control by default",
    description:
      "Users review and approve all actions. Agents assist but do not act without consent.",
    icon: ShieldCheck,
  },
  {
    title: "Explainable agent decisions",
    description:
      "Every recommendation comes with reasoning. Users understand why an action is suggested.",
    icon: Eye,
  },
  {
    title: "No invented refund numbers",
    description:
      "We only surface actual price differences from verified sources. No speculative savings.",
    icon: CheckCircle,
  },
  {
    title: "Practical automation over novelty",
    description:
      "We prioritize workflows that save real time over impressive but impractical features.",
    icon: Workflow,
  },
  {
    title: "Calm financial product design",
    description: "Money matters deserve a serious interface. No gamification or urgency tactics.",
    icon: Compass,
  },
] as const;

export function WorkingPrinciples() {
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
            Working principles
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-balance text-neutral-700">
            The values shaping how we build.
          </p>
        </div>

        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {principles.map((principle) => (
            <div key={principle.title}>
              <div className="flex size-10 items-center justify-center rounded-lg bg-neutral-100">
                <principle.icon className="size-5 text-neutral-700" aria-hidden />
              </div>
              <h3 className="mt-4 text-base font-medium text-neutral-900">{principle.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                {principle.description}
              </p>
            </div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
