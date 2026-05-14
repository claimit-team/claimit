import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const agentReasons = [
  {
    title: "Receipts are unstructured",
    description:
      "Email confirmations, PDFs, and retailer formats vary widely. The Ingest Agent handles receipt extraction across diverse formats.",
  },
  {
    title: "Policies are fragmented",
    description:
      "Each retailer and card issuer has different price protection windows and rules. The Monitor Agent handles policy-aware checks.",
  },
  {
    title: "Claims require follow-through",
    description:
      "Preparing materials and submitting claims takes time. The Claim Agent and Assistant help users review and act.",
  },
];

export function WhyAgents() {
  return (
    <section className="bg-neutral-50 py-24 sm:py-32 lg:py-40">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <h2 className="mb-4 text-center text-2xl font-semibold text-neutral-900">
          Why this product needs agents
        </h2>
        <p className="mx-auto mb-10 max-w-2xl text-center text-neutral-700">
          The complexity of price protection makes agent-based automation the right approach.
        </p>
        <div className="grid gap-6 md:grid-cols-3">
          {agentReasons.map((reason) => (
            <Card key={reason.title} className="border-neutral-200 bg-neutral-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base text-neutral-900">{reason.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-neutral-700">{reason.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
