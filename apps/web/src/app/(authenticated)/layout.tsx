"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { useAuthStore } from "@/store";

export default function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!user.onboarded) {
      router.replace("/onboarding");
    }
  }, [user, isLoading, router]);

  if (isLoading || !user || !user.onboarded) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-neutral-50">
        <Loader2 className="size-6 animate-spin text-neutral-500" aria-label="Loading" />
      </div>
    );
  }

  return <AuthenticatedShell>{children}</AuthenticatedShell>;
}
