"use client";

import { ArrowLeft } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { Fragment } from "react";
import { InterestForm } from "@/components/careers/interest-form";
import { buttonVariants } from "@/components/ui/button";
import { ABOUT_CLAIMIT_BOILERPLATE, type JobListing } from "@/lib/jobs-data";
import { cn } from "@/lib/utils";

type CareersJobDetailViewProps = {
  job: JobListing;
};

export function CareersJobDetailView({ job }: CareersJobDetailViewProps) {
  return (
    <div className="bg-neutral-0">
      <div className="bg-neutral-0">
        <div className="mx-auto max-w-4xl px-4 pt-8 sm:px-6 lg:px-8">
          <Link
            href="/careers"
            className="inline-flex items-center text-sm text-neutral-600 transition-colors duration-200 hover:text-neutral-900"
          >
            <ArrowLeft className="mr-1 size-4" aria-hidden />
            Back to careers
          </Link>
        </div>
      </div>

      <section className="bg-neutral-0 py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <p className="text-sm text-neutral-500">
            {job.area} · {job.location} · {job.employmentType}
          </p>
          <h1 className="mt-3 text-balance text-4xl font-semibold tracking-tight text-neutral-900 sm:text-5xl lg:text-6xl">
            {job.title}
          </h1>
          <p className="mt-4 max-w-2xl text-balance text-base leading-relaxed text-neutral-700 sm:text-lg">
            {job.summary}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              href="#interest-form"
              className={cn(
                buttonVariants({ size: "lg" }),
                "bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600",
              )}
            >
              Submit interest
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
        className="py-16 sm:py-20 lg:py-28"
      >
        <div className="mx-auto max-w-2xl space-y-12 px-4 sm:px-6 lg:px-8">
          <div>
            <h2 className="text-balance text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
              About the role
            </h2>
            <p className="mt-4 text-base leading-relaxed text-neutral-700">{job.aboutRole}</p>
          </div>

          <div>
            <h2 className="text-balance text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
              What you&apos;ll do
            </h2>
            <ul className="mt-6 list-disc space-y-3 pl-5 marker:text-neutral-400">
              {job.responsibilities.map((item) => (
                <li key={item} className="pl-1 text-base leading-relaxed text-neutral-700">
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-balance text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
              What you&apos;ll bring
            </h2>
            <ul className="mt-6 list-disc space-y-3 pl-5 marker:text-neutral-400">
              {job.requirements.map((item) => (
                <li key={item} className="pl-1 text-base leading-relaxed text-neutral-700">
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {job.niceToHave.length > 0 && (
            <div>
              <h2 className="text-balance text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
                Nice to have
              </h2>
              <ul className="mt-6 list-disc space-y-3 pl-5 marker:text-neutral-400">
                {job.niceToHave.map((item) => (
                  <li key={item} className="pl-1 text-base leading-relaxed text-neutral-700">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
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
            <p className="mx-auto mt-4 max-w-xl text-balance text-neutral-700">
              We&apos;ll reach out when we open this role.
            </p>
          </div>
          <div className="mt-10">
            <InterestForm roleSlug={job.slug} roleTitle={job.title} />
          </div>
        </div>
      </motion.section>

      {job.relatedRoles.length > 0 && (
        <div className="mx-auto max-w-2xl px-4 pb-8 text-center sm:px-6 lg:px-8">
          <p className="text-sm text-neutral-600">
            Other roles:{" "}
            {job.relatedRoles.map((rel, index) => (
              <Fragment key={rel.slug}>
                {index > 0 && <span className="mx-2 text-neutral-300">·</span>}
                <Link
                  href={`/careers/${rel.slug}`}
                  className="font-medium text-brand-primary-500 transition-colors duration-200 hover:text-brand-primary-600"
                >
                  {rel.title}
                </Link>
              </Fragment>
            ))}
          </p>
        </div>
      )}

      <div className="mx-auto max-w-2xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="border-t border-neutral-100 pt-8">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            About ClaimIt
          </p>
          <p className="mt-3 text-sm leading-relaxed text-neutral-600">
            {ABOUT_CLAIMIT_BOILERPLATE}
          </p>
        </div>
      </div>
    </div>
  );
}
