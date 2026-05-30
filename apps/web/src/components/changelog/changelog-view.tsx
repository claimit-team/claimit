"use client";

import { motion } from "motion/react";
import { COMING_SOON, RELEASES } from "@/lib/changelog-data";

export function ChangelogView() {
  const [v03, v02, v01] = RELEASES;

  return (
    <div className="min-h-screen bg-neutral-0">
      <section className="py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="text-center"
          >
            <h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight text-neutral-900 sm:text-5xl lg:text-6xl">
              What&apos;s new
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-balance text-base leading-relaxed text-neutral-700 sm:text-lg">
              Recent updates to the ClaimIt platform.
            </p>
          </motion.div>
        </div>
      </section>

      <motion.section
        className="border-t border-neutral-200 py-12 sm:py-16"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <p className="text-sm font-medium text-neutral-500">
            {v03.version} · {v03.date}
          </p>
          <h2 className="mt-3 text-balance text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
            {v03.title}
          </h2>
          <ul className="mt-6 list-disc space-y-3 pl-6 text-base leading-relaxed text-neutral-700 marker:text-neutral-400">
            {v03.highlights.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </motion.section>

      <motion.section
        className="border-t border-neutral-200 py-12 sm:py-16"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <p className="text-sm font-medium text-neutral-500">
            {v02.version} · {v02.date}
          </p>
          <h2 className="mt-3 text-balance text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
            {v02.title}
          </h2>
          <ul className="mt-6 list-disc space-y-3 pl-6 text-base leading-relaxed text-neutral-700 marker:text-neutral-400">
            {v02.highlights.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </motion.section>

      <motion.section
        className="border-t border-neutral-200 py-12 sm:py-16"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <p className="text-sm font-medium text-neutral-500">
            {v01.version} · {v01.date}
          </p>
          <h2 className="mt-3 text-balance text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
            {v01.title}
          </h2>
          <ul className="mt-6 list-disc space-y-3 pl-6 text-base leading-relaxed text-neutral-700 marker:text-neutral-400">
            {v01.highlights.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </motion.section>

      <motion.section
        className="border-t border-neutral-200 py-12 sm:py-16"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <p className="text-sm font-medium text-neutral-500">Coming soon</p>
          <ul className="mt-6 list-disc space-y-3 pl-6 text-base leading-relaxed text-neutral-700 marker:text-neutral-400">
            {COMING_SOON.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </motion.section>
    </div>
  );
}
