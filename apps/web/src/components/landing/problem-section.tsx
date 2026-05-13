import { Clock, FileWarning, HandHelping } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface ProblemSectionProps {
  isLoading?: boolean;
}

const problemCards = [
  {
    icon: FileWarning,
    title: "Policies Vary by Platform",
    description:
      "Every retailer, airline, and hotel has its own price protection policy. Eligibility rules, time windows, and claim processes differ widely.",
  },
  {
    icon: Clock,
    title: "Claim Windows Are Short",
    description:
      "Most price protection windows last 7 to 30 days. Even if you know a policy exists, remembering to check after every purchase is impractical.",
  },
  {
    icon: HandHelping,
    title: "Manual Follow-Up Required",
    description:
      "Filing a claim takes time—gathering receipts, finding the current price, filling out forms, sending emails, and sometimes chatting or calling.",
  },
] as const;

export function ProblemSection({ isLoading = false }: ProblemSectionProps) {
  return (
    <section className="border-t border-neutral-200 bg-neutral-50 px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-balance text-center text-2xl font-semibold text-neutral-900 sm:text-3xl">
          Price protection exists, but most people don&apos;t have time to use it
        </h2>

        {isLoading ? (
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="border-neutral-200 bg-neutral-0 p-6">
                <Skeleton className="mb-4 size-10 rounded-md" />
                <Skeleton className="mb-2 h-5 w-3/4 max-w-[12rem]" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="mt-2 h-4 w-full max-w-[13rem]" />
              </Card>
            ))}
          </div>
        ) : (
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {problemCards.map((card) => (
              <Card key={card.title} className="border-neutral-200 bg-neutral-0 p-6">
                <card.icon className="size-8 text-neutral-500" aria-hidden />
                <h3 className="mt-4 text-base font-semibold text-neutral-900">{card.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-700">{card.description}</p>
              </Card>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
