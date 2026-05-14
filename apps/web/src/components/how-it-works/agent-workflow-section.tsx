import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const agents = [
  {
    name: "Ingest Agent",
    responsibility: "Extracts purchase details from Gmail, PDFs, or images.",
    sampleEvent: "purchase.ingested",
  },
  {
    name: "Monitor Agent",
    responsibility: "Checks current prices and policy windows.",
    sampleEvent: "price.dropped",
  },
  {
    name: "Claim Agent",
    responsibility: "Drafts the correct claim material and validates required fields.",
    sampleEvent: "claim.drafted",
  },
  {
    name: "Assistant Agent",
    responsibility: "Explains decisions and helps refine drafts.",
    sampleEvent: "claim.redraft_requested",
  },
] as const;

const eventFlow = [
  "purchase.ingested",
  "price.dropped",
  "claim.drafted",
  "claim.approved",
  "claim.resolved",
] as const;

export function AgentWorkflowSection() {
  return (
    <section className="border-t border-neutral-200 bg-neutral-0 py-24 sm:py-32 lg:py-40">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-neutral-900 sm:text-3xl">
            A workflow, not a one-shot chatbot.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-neutral-700">
            ClaimIt uses specialized agents that handle different stages of the claim process.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {agents.map((agent) => (
            <Card key={agent.name} className="border-neutral-200 bg-neutral-0">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-neutral-900">{agent.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-neutral-700">{agent.responsibility}</p>
                <Badge variant="secondary" className="bg-neutral-100 text-neutral-600">
                  {agent.sampleEvent}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-12">
          <p className="mb-4 text-center text-sm font-medium text-neutral-500">Event flow</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {eventFlow.map((event, index) => (
              <div key={event} className="flex items-center gap-2">
                <Badge variant="outline" className="border-neutral-200 text-neutral-700">
                  {event}
                </Badge>
                {index < eventFlow.length - 1 && (
                  <ArrowRight className="h-4 w-4 text-neutral-400" aria-hidden />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
