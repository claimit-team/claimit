import { FileText, Layers, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";

const socialProofData = {
  stats: [
    {
      icon: FileText,
      value: "4 Types",
      label: "of claim materials",
    },
    {
      icon: Layers,
      value: "3 Categories",
      label: "Retail, Airlines, Hotels",
    },
  ],
  exampleReportedReclaimed: {
    icon: TrendingUp,
    amount: 342,
    qualifier: "Example dashboard, based on user-reported results.",
  },
} as const;

export function SocialProofSection() {
  return (
    <section className="border-t border-neutral-200 bg-neutral-50 px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="grid gap-6 sm:grid-cols-3">
          {socialProofData.stats.map((stat) => (
            <Card
              key={stat.label}
              className="flex flex-col items-center border-neutral-200 bg-neutral-0 p-6 text-center"
            >
              <stat.icon className="size-6 text-neutral-500" aria-hidden />
              <p className="mt-3 text-2xl font-semibold text-neutral-900">{stat.value}</p>
              <p className="mt-1 text-sm text-neutral-700">{stat.label}</p>
            </Card>
          ))}

          <Card className="flex flex-col items-center border-neutral-200 bg-neutral-0 p-6 text-center">
            <socialProofData.exampleReportedReclaimed.icon
              className="size-6 text-brand-accent-500"
              aria-hidden
            />
            <p className="mt-3 text-2xl font-semibold text-brand-accent-500">
              ${socialProofData.exampleReportedReclaimed.amount}
            </p>
            <p className="mt-1 text-sm text-neutral-700">Reclaimed This Month</p>
            <p className="mt-2 text-xs text-neutral-500">
              {socialProofData.exampleReportedReclaimed.qualifier}
            </p>
          </Card>
        </div>
      </div>
    </section>
  );
}
