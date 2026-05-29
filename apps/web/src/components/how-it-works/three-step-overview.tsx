import { Eye, FileCheck, Mail } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const steps = [
  {
    step: 1,
    title: "Upload or connect Gmail",
    description:
      "Add receipts manually by uploading PDF or image files, or connect your Gmail account for automatic order-confirmation ingestion.",
    behindTheScenes:
      "ClaimIt extracts purchase details like item name, price, date, and retailer. If extraction confidence is low, you may be asked to confirm details before monitoring begins.",
    icon: Mail,
  },
  {
    step: 2,
    title: "Monitor",
    description:
      "ClaimIt watches supported platforms during the relevant policy window, checking for price changes that may qualify for a refund.",
    behindTheScenes:
      "The system evaluates policies including window length, own-price drop vs competitor drop, category exclusions, and platform-specific rules.",
    icon: Eye,
  },
  {
    step: 3,
    title: "Claim",
    description:
      "When an eligible price drop is detected, ClaimIt prepares the right claim material for that platform—ready for your review.",
    behindTheScenes:
      "Output types include email draft, chat script, in-store guide, or self-service walkthrough. Approval-gated mode is on by default—you stay in control.",
    icon: FileCheck,
  },
] as const;

export function ThreeStepOverview() {
  return (
    <section className="border-t border-neutral-200 bg-neutral-0 py-24 sm:py-32 lg:py-40">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
            Three steps to claim-ready
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-neutral-700">
            From receipt to refund material in a straightforward workflow.
          </p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {steps.map((step) => (
            <Card key={step.step} className="border-neutral-200 bg-neutral-0">
              <CardHeader>
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100">
                    <step.icon className="h-5 w-5 text-neutral-700" aria-hidden />
                  </div>
                  <span className="text-sm font-medium text-neutral-500">Step {step.step}</span>
                </div>
                <CardTitle className="text-lg text-neutral-900">{step.title}</CardTitle>
                <CardDescription className="text-neutral-700">{step.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg bg-neutral-50 p-4">
                  <p className="text-xs font-medium text-neutral-500">
                    What happens behind the scenes
                  </p>
                  <p className="mt-1 text-sm text-neutral-700">{step.behindTheScenes}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
