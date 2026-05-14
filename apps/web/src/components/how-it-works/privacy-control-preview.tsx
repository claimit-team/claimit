import { CheckCircle, Eye, Shield, Upload } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const securityPoints = [
  {
    icon: Upload,
    text: "Gmail connection is optional. You can always upload receipts manually.",
  },
  {
    icon: Eye,
    text: "ClaimIt focuses on purchase-related signals only.",
  },
  {
    icon: CheckCircle,
    text: "You approve claims by default before any action is taken.",
  },
] as const;

export function PrivacyControlPreview() {
  return (
    <section className="border-t border-neutral-200 bg-neutral-50 py-24 sm:py-32 lg:py-40">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-xl border border-neutral-200 bg-neutral-0 p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100">
              <Shield className="h-5 w-5 text-neutral-700" aria-hidden />
            </div>
            <h2 className="text-xl font-semibold text-neutral-900">Privacy and control</h2>
          </div>

          <div className="mt-6 space-y-4">
            {securityPoints.map((point) => (
              <div key={point.text} className="flex items-start gap-3">
                <point.icon className="mt-0.5 h-5 w-5 shrink-0 text-neutral-500" aria-hidden />
                <p className="text-neutral-700">{point.text}</p>
              </div>
            ))}
          </div>

          <div className="mt-8">
            <Link
              href="/security"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "border-neutral-200 text-neutral-700 inline-flex justify-center items-center px-6",
              )}
            >
              Read security details
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
