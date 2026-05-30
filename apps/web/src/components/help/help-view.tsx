"use client";

import type { LucideIcon } from "lucide-react";
import { MessageCircle, Search, Workflow } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { faqData, faqTopics } from "@/lib/faq-data";
import { cn } from "@/lib/utils";

const howItWorksTile = {
  title: "How ClaimIt works",
  description: "See the agent workflow end to end",
  href: "/how-it-works",
  icon: Workflow,
} as const;

function TopicCardInner({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <Card className="flex h-full cursor-pointer flex-col rounded-xl bg-neutral-0 p-6 ring-1 ring-neutral-200 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm hover:ring-neutral-300">
      <div className="flex size-10 items-center justify-center rounded-lg bg-neutral-100">
        <Icon className="size-5 text-neutral-700" aria-hidden />
      </div>
      <h3 className="mt-4 text-base font-medium text-neutral-900 transition-colors duration-200 group-hover:text-brand-primary-600">
        {title}
      </h3>
      <p className="mt-2 min-h-[2.5rem] text-sm leading-relaxed text-neutral-600">{description}</p>
    </Card>
  );
}

export function HelpCenterView() {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredFaqData = useMemo(() => {
    if (!searchQuery.trim()) return faqData;

    const query = searchQuery.toLowerCase();
    return faqData
      .map((category) => ({
        ...category,
        questions: category.questions.filter(
          (q) => q.question.toLowerCase().includes(query) || q.answer.toLowerCase().includes(query),
        ),
      }))
      .filter((category) => category.questions.length > 0);
  }, [searchQuery]);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="bg-neutral-0">
      <section className="py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-balance text-4xl font-semibold tracking-tight text-neutral-900 sm:text-5xl lg:text-6xl">
              How can we help?
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-balance text-base leading-relaxed text-neutral-700 sm:text-lg">
              Find answers about connecting Gmail, monitoring purchases, reviewing claims, and
              reporting outcomes.
            </p>

            <div className="relative mx-auto mt-8 max-w-xl">
              <Search
                className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-neutral-500"
                aria-hidden
              />
              <Input
                type="search"
                placeholder="Search help articles…"
                className="h-12 border-neutral-200 pl-10 text-base ring-1 ring-neutral-200 focus-visible:ring-brand-primary-500"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search help articles"
              />
            </div>

            <div className="mt-6">
              <Link
                href="/help/contact"
                className={cn(
                  buttonVariants(),
                  "inline-flex items-center bg-brand-primary-500 text-neutral-0 transition-all duration-200 hover:bg-brand-primary-600 hover:scale-[1.02] active:scale-[0.98]",
                )}
              >
                <MessageCircle className="mr-2 size-4" />
                Contact support
              </Link>
            </div>
          </div>

          {!searchQuery && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="mt-12 sm:mt-16"
            >
              <h2 className="sr-only">Browse topics</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {faqTopics.map((topic) => {
                  const Icon = topic.icon;
                  return (
                    <button
                      key={topic.id}
                      type="button"
                      onClick={() => scrollToSection(topic.id)}
                      className="group w-full text-left"
                    >
                      <TopicCardInner
                        title={topic.title}
                        description={topic.description}
                        icon={Icon}
                      />
                    </button>
                  );
                })}
                <Link href={howItWorksTile.href} className="group block h-full text-left">
                  <TopicCardInner
                    title={howItWorksTile.title}
                    description={howItWorksTile.description}
                    icon={howItWorksTile.icon}
                  />
                </Link>
              </div>
            </motion.div>
          )}
        </div>
      </section>

      <section className="py-16 sm:py-20 lg:py-28">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8"
        >
          <div className="text-center">
            <h2 className="text-balance text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
              Frequently asked questions
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-balance text-neutral-700">
              Browse by topic or search above for specific answers.
            </p>
          </div>

          {filteredFaqData.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-neutral-700">No results found for &quot;{searchQuery}&quot;</p>
              <Button variant="link" className="mt-2" onClick={() => setSearchQuery("")}>
                Clear search
              </Button>
            </div>
          ) : (
            <div className="mt-12 space-y-12">
              {filteredFaqData.map((category) => (
                <div key={category.id} className="scroll-mt-24">
                  <h3 id={category.id} className="mb-4 text-lg font-semibold text-neutral-900">
                    {category.title}
                  </h3>
                  <Accordion multiple={false} className="w-full">
                    {category.questions.map((item) => {
                      const slug = `${category.id}-${item.question}`;
                      return (
                        <AccordionItem key={slug} value={slug}>
                          <AccordionTrigger className="text-left text-base font-medium text-neutral-900">
                            {item.question}
                          </AccordionTrigger>
                          <AccordionContent className="text-base leading-relaxed text-neutral-700">
                            {item.answer}
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </section>

      <section className="py-16 sm:py-20 lg:py-28">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="mx-auto max-w-2xl px-4 text-center sm:px-6 lg:px-8"
        >
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
            Still need help?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-balance text-neutral-700">
            Send us a note and we&apos;ll get back to you.
          </p>
          <div className="mt-8">
            <Link
              href="/help/contact"
              className={cn(
                buttonVariants({ size: "lg" }),
                "inline-flex bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600",
              )}
            >
              Contact support
            </Link>
          </div>
        </motion.div>
      </section>
    </div>
  );
}
