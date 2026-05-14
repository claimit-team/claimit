import { ArrowLeft, FileQuestion } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function ClaimNotFound() {
  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center bg-neutral-50 px-4">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100">
          <FileQuestion className="h-8 w-8 text-neutral-400" />
        </div>
        <h1 className="mb-2 font-semibold text-2xl text-neutral-900">Claim not found</h1>
        <p className="mb-6 text-neutral-500">
          The claim you&apos;re looking for doesn&apos;t exist or has been removed.
        </p>
        <Link href="/claims" className={cn(buttonVariants({ size: "sm" }), "gap-2")}>
          <ArrowLeft className="h-4 w-4" />
          Back to claims
        </Link>
      </div>
    </div>
  );
}
