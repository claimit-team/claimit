import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function CareersTeaser() {
  return (
    <section className="bg-neutral-50 py-24 sm:py-32 lg:py-40">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
        <Card className="border-neutral-200 bg-neutral-0">
          <CardContent className="pt-6 text-center">
            <h2 className="text-xl font-semibold text-neutral-900">
              Interested in what we are building?
            </h2>
            <p className="mt-3 text-neutral-700">
              We are not hiring broadly yet, but you can drop your resume for future roles.
            </p>
            <Link href="/careers" className={cn(buttonVariants({ variant: "outline" }), "mt-6")}>
              View careers
            </Link>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
