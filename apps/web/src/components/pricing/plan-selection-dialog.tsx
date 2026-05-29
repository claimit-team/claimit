"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type PaidPlan = "pro" | "family";
type BillingCadence = "monthly" | "annual";

interface PlanSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: PaidPlan;
  billing: BillingCadence;
}

const PLAN_NAMES: Record<PaidPlan, string> = {
  pro: "Pro",
  family: "Family",
};

export function PlanSelectionDialog({
  open,
  onOpenChange,
  plan,
  billing,
}: PlanSelectionDialogProps) {
  const router = useRouter();
  const planName = PLAN_NAMES[plan];

  const handleSignIn = () => {
    router.push(`/login?plan=${plan}&billing=${billing}`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-neutral-200 bg-neutral-0 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-neutral-900">All features are currently free</DialogTitle>
          <DialogDescription className="text-neutral-700">
            ClaimIt is in early access. All {planName} features are available to everyone at no cost
            today. We&apos;ll let you know before any pricing takes effect.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="border-neutral-200 bg-neutral-50">
          {/* TODO(stripe): When Stripe Checkout integration ships, this primary CTA will call createCheckoutSession({ plan, billing }) instead of linking to /login. /login remains the destination for new sign-ins from the Free plan; the Stripe checkout handles Pro/Family from this dialog. */}
          <Button type="button" onClick={handleSignIn} className="w-full sm:w-auto">
            Sign in to continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
