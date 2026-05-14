import { Activity, ArrowRight, CheckCircle2, FileText } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface HeroSectionProps {
  isLoading?: boolean;
}

const previewRows = [
  { label: "Receipt Detected", status: "Complete", statusType: "complete" as const },
  { label: "Price Verified", status: "Monitoring", statusType: "monitoring" as const },
  { label: "Claim Draft Ready", status: "Pending Review", statusType: "review" as const },
];

function StatusBadge({
  status,
  type,
}: {
  status: string;
  type: "complete" | "monitoring" | "review";
}) {
  const variants = {
    complete: "border-brand-primary-200 bg-brand-primary-50 text-brand-primary-700",
    monitoring: "border-neutral-200 bg-neutral-50 text-neutral-700",
    review: "border-semantic-warning/20 bg-semantic-warning-bg text-semantic-warning",
  };

  return (
    <Badge variant="outline" className={variants[type]}>
      {status}
    </Badge>
  );
}

function StatusIcon({ type }: { type: "complete" | "monitoring" | "review" }) {
  const iconClass = {
    complete: "text-brand-primary-500",
    monitoring: "text-neutral-500",
    review: "text-semantic-warning",
  };

  if (type === "complete")
    return <CheckCircle2 className={cn("size-4 shrink-0", iconClass.complete)} />;
  if (type === "monitoring")
    return <Activity className={cn("size-4 shrink-0", iconClass.monitoring)} />;
  return <FileText className={cn("size-4 shrink-0", iconClass.review)} />;
}

export function HeroSection({ isLoading = false }: HeroSectionProps) {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
      <div className="mx-auto max-w-6xl">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="text-center lg:text-left">
            <h1 className="text-balance text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl lg:text-5xl">
              Never Miss a Refund Window Again
            </h1>
            <p className="mt-6 text-pretty text-base leading-relaxed text-neutral-700 sm:text-lg">
              ClaimIt watches eligible post-purchase price protection windows, drafts the right
              claim material, and keeps you in control before anything is sent.
            </p>
            <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row lg:justify-start">
              <Link
                href="/login"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "w-full gap-2 bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600 sm:w-auto inline-flex justify-center items-center",
                )}
              >
                Try Free
                <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link
                href="/how-it-works"
                className="text-sm text-neutral-700 underline-offset-4 transition-colors hover:text-neutral-900 hover:underline"
              >
                See How It Works
              </Link>
            </div>
          </div>

          <div className="flex justify-center lg:justify-end">
            {isLoading ? (
              <Card className="w-full max-w-sm border-neutral-200 bg-neutral-0 p-6">
                <Skeleton className="mb-4 h-5 w-32" />
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center justify-between gap-4">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-5 w-16" />
                    </div>
                  ))}
                </div>
              </Card>
            ) : (
              <Card className="w-full max-w-sm border-neutral-200 bg-neutral-0 py-0">
                <div className="border-b border-neutral-200 px-6 py-4">
                  <p className="text-sm font-medium text-neutral-900">Dashboard Status</p>
                </div>
                <div className="divide-y divide-neutral-200">
                  {previewRows.map((row) => (
                    <div
                      key={row.label}
                      className="flex items-center justify-between gap-4 px-6 py-4"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <StatusIcon type={row.statusType} />
                        <span className="text-sm text-neutral-700">{row.label}</span>
                      </div>
                      <StatusBadge status={row.status} type={row.statusType} />
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
