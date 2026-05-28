"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { FlowPreview } from "@/components/onboarding/flow-preview";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { signOutUser } from "@/lib/auth-actions";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store";

export function WelcomeCard() {
  const router = useRouter();
  const [isSwitchingAccount, setIsSwitchingAccount] = useState(false);

  const handleUseDifferentAccount = async () => {
    if (isSwitchingAccount) return;
    setIsSwitchingAccount(true);
    try {
      await signOutUser();
      useAuthStore.getState().signOut();
      router.push("/login");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign out failed.";
      toast.error(message);
      setIsSwitchingAccount(false);
    }
  };

  return (
    <Card className="w-full border-neutral-200 bg-neutral-0 shadow-sm">
      <CardContent className="flex flex-col gap-6">
        <div className="space-y-3 text-center">
          <h1 className="font-heading text-xl font-semibold text-neutral-900">
            Welcome to ClaimIt
          </h1>
          <p className="text-sm leading-relaxed text-neutral-700">
            ClaimIt helps you monitor purchases after checkout and prepare refund claim materials
            when a supported platform&apos;s price protection policy applies. You stay in control of
            what gets reviewed, sent, or marked resolved. The goal is a clearer reclaim workflow
            without chasing policies by hand.
          </p>
        </div>

        <FlowPreview />

        <div className="flex flex-col gap-3">
          <Link
            href="/onboarding/gmail"
            className={cn(
              buttonVariants({ size: "lg" }),
              "w-full bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600",
            )}
          >
            Get started
          </Link>

          <p className="text-center text-xs text-neutral-500">
            <button
              type="button"
              onClick={() => void handleUseDifferentAccount()}
              disabled={isSwitchingAccount}
              className="text-brand-primary-600 underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSwitchingAccount ? "Signing out…" : "Use a different account"}
            </button>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
