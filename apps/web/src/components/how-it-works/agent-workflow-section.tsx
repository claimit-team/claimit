"use client";

import { ChevronRight, FileEdit, Inbox, MessageCircle, TrendingDown } from "lucide-react";
import { motion } from "motion/react";
import { Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const agents = [
  {
    name: "Ingest Agent",
    responsibility: "Extracts purchase details from Gmail, PDFs, or images.",
    sampleEvent: "Purchase detected",
    icon: Inbox,
  },
  {
    name: "Monitor Agent",
    responsibility: "Checks current prices and policy windows.",
    sampleEvent: "Price drop found",
    icon: TrendingDown,
  },
  {
    name: "Claim Agent",
    responsibility: "Drafts the correct claim material and validates required fields.",
    sampleEvent: "Draft ready",
    icon: FileEdit,
  },
  {
    name: "Assistant Agent",
    responsibility: "Explains decisions and helps refine drafts.",
    sampleEvent: "Refinement requested",
    icon: MessageCircle,
  },
] as const;

const eventFlow = [
  "Purchase detected",
  "Price drop found",
  "Draft ready",
  "You approve",
  "Outcome recorded",
] as const;

export function AgentWorkflowSection() {
  return (
    <section className="bg-neutral-0 py-24 sm:py-32 lg:py-40">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8"
      >
        <div className="text-center">
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
            A workflow, not a one-shot chatbot.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-neutral-700">
            ClaimIt runs a multi-step workflow—detect purchases, watch prices, draft claims, and
            surface outcomes—instead of answering from a single prompt.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {agents.map((agent) => (
            <Card key={agent.name} className="border-neutral-200 bg-neutral-0">
              <CardHeader className="pb-2">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100">
                  <agent.icon className="h-5 w-5 text-neutral-700" aria-hidden />
                </div>
                <CardTitle className="text-base text-neutral-900">{agent.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-neutral-700">{agent.responsibility}</p>
                <Badge variant="secondary" className="bg-neutral-100 text-neutral-600">
                  {agent.sampleEvent}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-12">
          <p className="mb-4 text-center text-sm font-medium text-neutral-500">Event flow</p>
          <div className="flex flex-col items-stretch gap-4 lg:flex-row lg:items-center lg:justify-between">
            {eventFlow.map((label, idx) => (
              <Fragment key={label}>
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-neutral-300 text-sm font-medium text-neutral-700">
                    {idx + 1}
                  </span>
                  <span className="text-sm text-neutral-700">{label}</span>
                </div>
                {idx < eventFlow.length - 1 ? (
                  <ChevronRight
                    className="hidden h-4 w-4 shrink-0 text-neutral-400 lg:block"
                    aria-hidden
                  />
                ) : null}
              </Fragment>
            ))}
          </div>
        </div>
      </motion.div>
    </section>
  );
}
