"use client";

import { MessageCircle, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { faqData, faqTopics } from "@/lib/faq-data";
import { cn } from "@/lib/utils";

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
    <div className="bg-background">
      {/* Hero Section */}
      <section className="flex min-h-[40vh] flex-col justify-center border-b border-border bg-muted/30 sm:min-h-[50vh]">
        <div className="mx-auto w-full max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="text-balance text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl">
            How can we help?
          </h1>
          <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground sm:text-xl">
            Find answers about connecting Gmail, monitoring purchases, reviewing claims, and
            reporting outcomes.
          </p>

          {/* Search Input */}
          <div className="relative mx-auto mt-8 max-w-xl">
            <Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search help articles…"
              className="h-12 pl-10 text-base"
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
                "inline-flex items-center transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]",
              )}
            >
              <MessageCircle className="mr-2 size-4" />
              Contact support
            </Link>
          </div>
        </div>
      </section>

      {/* Quick Topic Cards */}
      {!searchQuery && (
        <section className="py-24 sm:py-32 lg:py-40">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <h2 className="sr-only">Quick topics</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {faqTopics.map((topic) => {
                const Icon = topic.icon;
                return (
                  <button
                    key={topic.id}
                    type="button"
                    onClick={() => scrollToSection(topic.id)}
                    className="group text-left"
                  >
                    <Card className="h-full transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
                      <CardContent className="flex items-start gap-4 pt-6">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                          <Icon className="size-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground group-hover:text-primary">
                            {topic.title}
                          </h3>
                          <p className="mt-1 text-sm text-muted-foreground">{topic.description}</p>
                        </div>
                      </CardContent>
                    </Card>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* FAQ Sections */}
      <section className="py-24 sm:py-32 lg:py-40">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          {filteredFaqData.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-muted-foreground">
                No results found for &quot;{searchQuery}&quot;
              </p>
              <Button variant="link" className="mt-2" onClick={() => setSearchQuery("")}>
                Clear search
              </Button>
            </div>
          ) : (
            <div className="space-y-12">
              {filteredFaqData.map((category) => (
                <div key={category.id} id={category.id} className="scroll-mt-24">
                  <h2 className="mb-4 text-xl font-semibold text-foreground">{category.title}</h2>
                  <Accordion multiple={false} className="w-full">
                    {category.questions.map((item) => {
                      const slug = `${category.id}-${item.question}`;
                      return (
                        <AccordionItem key={slug} value={slug}>
                          <AccordionTrigger className="text-left">{item.question}</AccordionTrigger>
                          <AccordionContent className="text-muted-foreground leading-relaxed">
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
        </div>
      </section>

      {/* Contact Support CTA */}
      <section className="border-t border-border bg-muted/30 py-24 sm:py-32 lg:py-40">
        <div className="mx-auto max-w-2xl px-4 text-center sm:px-6 lg:px-8">
          <Card className="bg-card">
            <CardContent className="py-10">
              <h2 className="text-2xl font-semibold text-foreground">Still need help?</h2>
              <p className="mt-3 text-muted-foreground">Send a note and we will follow up.</p>
              <Link
                href="/help/contact"
                className={cn(buttonVariants({ size: "lg" }), "mt-6 inline-flex items-center")}
              >
                <MessageCircle className="mr-2 size-4" />
                Contact support
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
