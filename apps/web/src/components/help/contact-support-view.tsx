"use client";

import { ArrowLeft } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { ContactForm } from "@/components/help/contact-form";

export function ContactSupportView() {
  return (
    <div className="min-h-screen bg-neutral-0">
      <div className="mx-auto max-w-4xl px-4 pt-8 sm:px-6 lg:px-8">
        <Link
          href="/help"
          className="inline-flex items-center text-sm font-medium text-neutral-600 transition-colors hover:text-brand-primary-600"
        >
          <ArrowLeft className="mr-1.5 size-4" aria-hidden />
          Back to help
        </Link>
      </div>

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
              Contact support
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-balance text-base leading-relaxed text-neutral-700 sm:text-lg">
              Reach our team and we&apos;ll respond soon.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="pb-12 sm:pb-16 lg:pb-20">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <ContactForm />
          </motion.div>
        </div>
      </section>
    </div>
  );
}
