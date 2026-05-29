"use client";

import { ArrowRight, Layout, Server, Workflow } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import type { ComponentProps } from "react";
import { InterestForm } from "@/components/careers/interest-form";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { buttonVariants } from "@/components/ui/button";
import { jobsData } from "@/lib/jobs-data";
import { cn } from "@/lib/utils";

const ROLE_ICONS = {
  "frontend-engineer": Layout,
  "backend-infrastructure-engineer": Server,
  "agent-logic-engineer": Workflow,
} as const;

function RoleIcon({ slug, ...props }: { slug: string } & ComponentProps<typeof Layout>) {
  const Icon = ROLE_ICONS[slug as keyof typeof ROLE_ICONS] ?? Layout;
  return <Icon {...props} />;
}

const faq = [
  {
    question: "Are these roles open now?",
    answer:
      "These are future roles we're shaping. We're not actively hiring against specific headcount, but we review every submission and reach out when timing aligns.",
  },
  {
    question: "When will you start hiring?",
    answer:
      "We expect to open specific roles as we scale beyond the founding team. Submissions today help us understand the pipeline we're building toward.",
  },
  {
    question: "Can I apply if I don't see my exact role?",
    answer:
      "Yes — drop your resume and a short note about what you'd like to build. We're interested in people who care about reliable agent systems and clean user experience.",
  },
  {
    question: "Is ClaimIt remote?",
    answer:
      "Work format has not been finalized. As an early-stage project, we have not established formal policies around location or remote work.",
  },
];

export function CareersListView() {
  return (
    <div className="bg-neutral-0">
      <section className="bg-neutral-0 py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="text-balance text-4xl font-semibold tracking-tight text-neutral-900 sm:text-5xl lg:text-6xl">
            Build practical agents for real-world follow-through.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-balance text-base leading-relaxed text-neutral-700 sm:text-lg">
            Build agents for the work that always slips.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="#interest-form"
              className={cn(
                buttonVariants({ size: "lg" }),
                "bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600",
              )}
            >
              Drop your resume
            </Link>
            <Link href="/team" className={buttonVariants({ variant: "ghost", size: "lg" })}>
              Meet the team
            </Link>
          </div>
        </div>
      </section>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="bg-neutral-0 py-16 sm:py-20 lg:py-28"
      >
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-balance text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
              Where we&apos;ll hire
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-balance text-neutral-700">
              Future roles. Drop your resume and we&apos;ll be in touch.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {jobsData.map((role) => (
              <Link key={role.slug} href={`/careers/${role.slug}`} className="group block h-full">
                <div className="flex h-full flex-col rounded-xl bg-neutral-0 p-6 ring-1 ring-neutral-200 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm hover:ring-neutral-300">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-neutral-100">
                    <RoleIcon slug={role.slug} className="size-5 text-neutral-700" aria-hidden />
                  </div>
                  <h3 className="mt-4 min-h-[3rem] text-base font-medium text-neutral-900 transition-colors duration-200 group-hover:text-brand-primary-600">
                    {role.title}
                  </h3>
                  <p className="mt-1 flex-1 text-sm leading-relaxed text-neutral-600">
                    {role.summary}
                  </p>
                  <span className="mt-4 inline-flex items-center text-sm font-medium text-brand-primary-500 transition-colors duration-200 group-hover:text-brand-primary-600">
                    View role
                    <ArrowRight
                      className="ml-1 size-4 transition-transform duration-200 group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </motion.section>

      <motion.section
        id="interest-form"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="scroll-mt-24 py-16 sm:py-20 lg:py-28"
      >
        <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-balance text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
              Submit your interest
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-balance text-neutral-700">
              Drop your resume. We&apos;ll reach out when we open the role.
            </p>
          </div>
          <div className="mt-10">
            <InterestForm />
          </div>
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="py-16 sm:py-20 lg:py-28"
      >
        <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-balance text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
              Frequently asked questions
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-balance text-neutral-700">
              About the team, hiring timeline, and submission process.
            </p>
          </div>
          <Accordion multiple={false} className="mt-10 w-full">
            {faq.map((item) => (
              <AccordionItem
                key={item.question}
                value={item.question}
                className="border-neutral-200"
              >
                <AccordionTrigger className="text-left text-base font-medium text-neutral-900 hover:no-underline">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="text-base leading-relaxed text-neutral-700">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </motion.section>
    </div>
  );
}
