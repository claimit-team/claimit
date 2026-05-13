import { CheckCircle2, Eye, FileText, MessageSquareText, Minimize2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function AssistantSection() {
  return (
    <section className="border-t border-neutral-200 px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="flex flex-col justify-center">
            <h2 className="text-balance text-2xl font-semibold text-neutral-900 sm:text-3xl">
              Review, Ask, Refine, Approve
            </h2>
            <p className="mt-4 text-pretty leading-relaxed text-neutral-700">
              The assistant explains why a claim draft was generated, helps refine the wording, and
              keeps approval gating on by default.
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-neutral-200 text-neutral-700 gap-2"
              >
                <Sparkles className="size-4 shrink-0" aria-hidden />
                Explain Why
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-neutral-200 text-neutral-700 gap-2"
              >
                <Minimize2 className="size-4 shrink-0" aria-hidden />
                Make Shorter
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-neutral-200 text-neutral-700 gap-2"
              >
                <Eye className="size-4 shrink-0" aria-hidden />
                Review Draft
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <Card className="border-neutral-200 bg-neutral-0 p-0">
              <div className="border-b border-neutral-200 px-4 py-3">
                <div className="flex items-center gap-2">
                  <MessageSquareText
                    className="size-4 shrink-0 text-brand-primary-500"
                    aria-hidden
                  />
                  <span className="text-sm font-medium text-neutral-900">Assistant</span>
                </div>
              </div>
              <div className="p-4">
                <p className="text-sm text-neutral-700">
                  I detected a price drop of $42.00 at BestBuy. The item is within the 30-day price
                  protection window. I&apos;ve prepared an email draft based on their online form
                  format.
                </p>
              </div>
            </Card>

            <Card className="border-neutral-200 bg-neutral-0 p-0">
              <div className="border-b border-neutral-200 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FileText className="size-4 shrink-0 text-brand-accent-500" aria-hidden />
                    <span className="text-sm font-medium text-neutral-900">Claim Draft</span>
                  </div>
                  <Badge
                    variant="outline"
                    className="border-brand-accent-200 bg-brand-accent-50 text-brand-accent-700 shrink-0"
                  >
                    Pending Review
                  </Badge>
                </div>
              </div>
              <div className="p-4">
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-neutral-500">Merchant</span>
                    <span className="text-neutral-900">BestBuy</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-neutral-500">Type</span>
                    <span className="text-neutral-900">Email Draft</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-neutral-500">Difference</span>
                    <span className="text-neutral-900">$42.00</span>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 gap-1.5 bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600"
                  >
                    <CheckCircle2 className="size-4 shrink-0" aria-hidden />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 border-neutral-200 text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900"
                  >
                    Edit
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}
