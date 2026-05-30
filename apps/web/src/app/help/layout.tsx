"use client";

import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { PublicFooter } from "@/components/layout/public-footer";
import { PublicHeader } from "@/components/layout/public-header";
import { useAuthStore } from "@/store";

export default function HelpLayout({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-neutral-50">
        <Loader2 className="size-6 animate-spin text-neutral-500" aria-label="Loading" />
      </div>
    );
  }

  if (user?.onboarded) {
    return <AuthenticatedShell>{children}</AuthenticatedShell>;
  }

  return (
    <div className="flex min-h-dvh flex-col bg-neutral-0">
      <PublicHeader />
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  );
}
