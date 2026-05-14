"use client";

import { FileText, Layers, TrendingUp } from "lucide-react";
import { animate, motion, useInView, useMotionValue, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
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

function AnimatedAmount({ target }: { target: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const motionValue = useMotionValue(0);
  const rounded = useTransform(motionValue, (v) => Math.round(v));
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const unsubscribe = rounded.on("change", (v) => setDisplay(v));
    return () => unsubscribe();
  }, [rounded]);

  useEffect(() => {
    if (inView) {
      const controls = animate(motionValue, target, { duration: 1.5, ease: "easeOut" });
      return () => controls.stop();
    }
  }, [inView, motionValue, target]);

  return <span ref={ref}>{display}</span>;
}

export function SocialProofSection() {
  return (
    <section className="border-t border-neutral-200 bg-neutral-50 px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="mx-auto max-w-4xl"
      >
        <div className="grid gap-6 sm:grid-cols-3">
          {socialProofData.stats.map((stat) => (
            <Card
              key={stat.label}
              className="flex flex-col items-center border-neutral-200 bg-neutral-0 p-6 text-center"
            >
              <stat.icon className="size-6 text-neutral-500" aria-hidden />
              <p className="mt-3 text-2xl font-semibold text-neutral-900 tabular-nums">
                {stat.value}
              </p>
              <p className="mt-1 text-sm text-neutral-700">{stat.label}</p>
            </Card>
          ))}

          <Card className="flex flex-col items-center border-neutral-200 bg-neutral-0 p-6 text-center">
            <socialProofData.exampleReportedReclaimed.icon
              className="size-6 text-brand-accent-500"
              aria-hidden
            />
            <p className="mt-3 text-2xl font-semibold text-brand-accent-500 tabular-nums">
              $<AnimatedAmount target={socialProofData.exampleReportedReclaimed.amount} />
            </p>
            <p className="mt-1 text-sm text-neutral-700">Reclaimed This Month</p>
            <p className="mt-2 text-xs text-neutral-500">
              {socialProofData.exampleReportedReclaimed.qualifier}
            </p>
          </Card>
        </div>
      </motion.div>
    </section>
  );
}
