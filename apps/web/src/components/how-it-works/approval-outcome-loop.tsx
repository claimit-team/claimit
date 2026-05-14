import { AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const controlPoints = [
  {
    title: "Approval-gated by default",
    description:
      "Every claim draft requires your approval before any action is taken. You review the material before it goes anywhere.",
  },
  {
    title: "Auto-send is opt-in",
    description:
      "If you enable auto-send, eligible email claims can be sent automatically. This setting only applies to email-based claims.",
  },
  {
    title: "Outcomes are user-reported",
    description:
      "Most claim resolutions happen outside ClaimIt—via retailer response, store visit, or portal submission. You update the outcome status.",
  },
] as const;

export function ApprovalOutcomeLoop() {
  return (
    <section className="border-t border-neutral-200 bg-neutral-0 py-24 sm:py-32 lg:py-40">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-neutral-900 sm:text-3xl">
            You stay in control.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-neutral-700">
            ClaimIt prepares everything, but you decide what gets sent and when.
          </p>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-2">
          <div className="space-y-4">
            {controlPoints.map((point) => (
              <div
                key={point.title}
                className="rounded-lg border border-neutral-200 bg-neutral-0 p-4"
              >
                <h3 className="font-medium text-neutral-900">{point.title}</h3>
                <p className="mt-1 text-sm text-neutral-700">{point.description}</p>
              </div>
            ))}
          </div>

          <Card className="border-neutral-200 bg-neutral-0">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Badge className="bg-semantic-warning-bg text-semantic-warning border-semantic-warning/20 hover:bg-semantic-warning-bg gap-1 border">
                  <AlertCircle className="h-3 w-3 shrink-0" aria-hidden />
                  Update needed
                </Badge>
              </div>
              <CardTitle className="mt-3 text-base text-neutral-900">
                Hilton claim submitted 6 days ago
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-neutral-700">
                This claim was sent via email. Please update the outcome when you hear back.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="border-neutral-200 text-neutral-700">
                  Mark approved
                </Button>
                <Button variant="outline" size="sm" className="border-neutral-200 text-neutral-700">
                  Mark denied
                </Button>
                <Button variant="ghost" size="sm" className="text-neutral-500">
                  Still waiting
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
