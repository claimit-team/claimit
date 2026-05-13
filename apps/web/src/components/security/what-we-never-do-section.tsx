import { CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const neverDoList = [
  "We do not sell your personal data.",
  "We do not store your Gmail password.",
  "We do not send claims without your configured approval or auto-send preference.",
  "We do not use purchase data for coupon targeting or ad profiles.",
  "We do not treat unreported claim outcomes as verified reclaimed money.",
];

export function WhatWeNeverDoSection() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="max-w-3xl">
          <Badge variant="secondary" className="mb-4">
            Commitments
          </Badge>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            What we never do
          </h2>
          <ul className="mt-8 space-y-4">
            {neverDoList.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
                <span className="leading-relaxed text-muted-foreground">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
