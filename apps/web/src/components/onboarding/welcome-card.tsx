"use client";

import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { FlowPreview } from "@/components/onboarding/flow-preview";
import { Button } from "@/components/ui/button";
import { signOutUser } from "@/lib/auth-actions";
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
    <div className="space-y-6">
      <div className="flex flex-col items-center text-center">
        <div className="flex size-12 items-center justify-center rounded-xl bg-neutral-100">
          <ShieldCheck className="size-6 text-neutral-700" aria-hidden />
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-balance text-neutral-900 sm:text-3xl">
          Welcome to ClaimIt
        </h1>
        <p className="mt-3 text-base leading-relaxed text-neutral-600">
          We watch the prices on what you buy and file the refund claims for you when prices drop.
        </p>
      </div>

      <FlowPreview />

      <div className="space-y-3">
        <Button
          render={<Link href="/onboarding/gmail" />}
          size="lg"
          className="w-full bg-neutral-900 text-neutral-0 hover:bg-neutral-800"
        >
          Get started
        </Button>

        <p className="text-center">
          <button
            type="button"
            onClick={() => void handleUseDifferentAccount()}
            disabled={isSwitchingAccount}
            className="text-sm text-neutral-500 transition-colors hover:text-neutral-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSwitchingAccount ? "Signing out…" : "Use a different account"}
          </button>
        </p>
      </div>
    </div>
  );
}
