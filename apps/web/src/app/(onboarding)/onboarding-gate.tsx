"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { useAuthStore } from "@/store";

/**
 * Client-side auth gate for the onboarding shell. Wraps the (onboarding)
 * route group so the layout file itself can stay a server component (and
 * keep its `metadata` export). Three states:
 *
 *   loading        → spinner (no redirect; AuthInit is still hydrating)
 *   no user        → /login
 *   onboarded user → /dashboard (no replay of completed onboarding)
 *   un-onboarded   → render children (the actual onboarding pages)
 *
 * Mirrors the (authenticated)/layout gate but inverted on `onboarded`.
 */
export function OnboardingGate({ children }: Readonly<{ children: ReactNode }>) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.onboarded) {
      router.replace("/dashboard");
    }
  }, [user, isLoading, router]);

  if (isLoading || !user || user.onboarded) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-neutral-50">
        <Loader2 className="size-6 animate-spin text-neutral-500" aria-label="Loading" />
      </div>
    );
  }

  return <>{children}</>;
}
