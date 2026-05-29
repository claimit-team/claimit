"use client";

import { Mail, MapPin, MessageSquareText, MousePointer } from "lucide-react";
import { motion } from "motion/react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface OutputTypesSectionProps {
  isLoading?: boolean;
}

const outputTypes = [
  {
    icon: Mail,
    title: "Email Draft",
    description: "A ready-to-send email with all necessary details included.",
    action: "You review and send, or enable auto-send.",
  },
  {
    icon: MessageSquareText,
    title: "Chat Script",
    description: "Step-by-step prompts and wording for live chat support.",
    action: "You conduct the chat conversation yourself.",
  },
  {
    icon: MapPin,
    title: "In-Store Guide",
    description: "Instructions for how to request a price match at a physical location.",
    action: "You take the guide and visit in person.",
  },
  {
    icon: MousePointer,
    title: "Self-Service Guide",
    description: "Step-by-step instructions for navigating a merchant's self-service portal.",
    action: "You follow the steps on their website.",
  },
] as const;

export function OutputTypesSection({ isLoading = false }: OutputTypesSectionProps) {
  return (
    <section className="bg-neutral-0 py-24 sm:py-32 lg:py-40">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8"
      >
        <h2 className="text-balance text-center text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
          Matches the actual claim process for each platform
        </h2>
        <p className="mx-auto mt-4 max-w-3xl text-center text-neutral-700">
          ClaimIt generates the right type of material based on the specific merchant&apos;s claim
          process.
        </p>

        {isLoading ? (
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="border-neutral-200 bg-neutral-0 p-6">
                <Skeleton className="mb-4 size-8 rounded-md" />
                <Skeleton className="mb-2 h-5 w-1/2 max-w-[6rem]" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="mt-4 h-4 w-3/4 max-w-[8rem]" />
              </Card>
            ))}
          </div>
        ) : (
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {outputTypes.map((output) => (
              <Card
                key={output.title}
                className="flex h-full flex-col border-neutral-200 bg-neutral-0 p-6"
              >
                <output.icon className="size-6 text-brand-primary-500" aria-hidden />
                <h3 className="mt-4 text-base font-semibold text-neutral-900">{output.title}</h3>
                <p className="mt-2 text-sm text-neutral-700">{output.description}</p>
                <p className="mt-auto pt-3 text-sm text-neutral-500">{output.action}</p>
              </Card>
            ))}
          </div>
        )}
      </motion.div>
    </section>
  );
}
