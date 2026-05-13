import { Card, CardContent } from "@/components/ui/card";

export function TeamOverview() {
  return (
    <section className="bg-neutral-50 py-12 sm:py-16">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <Card className="border-neutral-200 bg-neutral-0">
          <CardContent className="pt-6">
            <div className="space-y-4 text-neutral-700">
              <p>ClaimIt was built for the Google Cloud Rapid Agent Hackathon.</p>
              <p>
                The product combines agent orchestration, receipt ingestion, price monitoring, claim
                drafting, and Assistant explainability.
              </p>
              <p>The team is focused on practical automation with user control.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
