import { Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function ProductPrinciplesCallout() {
  return (
    <Card className="mb-12 border-neutral-200 bg-neutral-50">
      <CardContent className="flex gap-3 py-4">
        <Info className="h-5 w-5 flex-shrink-0 text-neutral-500" />
        <p className="text-sm leading-relaxed text-neutral-700">
          Changelog entries describe UI and product changes only. ClaimIt does not treat draft
          claims, detected drops, or unreported outcomes as verified reclaimed money.
        </p>
      </CardContent>
    </Card>
  );
}
