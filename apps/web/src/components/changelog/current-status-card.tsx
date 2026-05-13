import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const focusAreas = [
  "Public site",
  "Dashboard shell",
  "Claim review workflow",
  "Assistant surfaces",
];

export function CurrentStatusCard() {
  return (
    <Card className="mb-12 border-neutral-200 bg-neutral-0">
      <CardHeader>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="border-brand-primary-500 text-brand-primary-500">
            MVP
          </Badge>
          <CardTitle className="text-lg text-neutral-900">
            Focused on demo-critical workflows
          </CardTitle>
        </div>
        <CardDescription className="text-neutral-700">
          Current work prioritizes onboarding, dashboard review, receipt upload, claim drafting
          surfaces, Assistant UI, and outcome reporting.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2 sm:grid-cols-2">
          {focusAreas.map((area) => (
            <li key={area} className="flex items-center gap-2 text-sm text-neutral-700">
              <Check className="h-4 w-4 text-brand-primary-500" />
              {area}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
