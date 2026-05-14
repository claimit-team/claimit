import { Eye, LockKeyhole, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const principles = [
  {
    title: "Least access",
    description:
      "ClaimIt asks for the Gmail scopes needed for receipt ingestion and eligible email claim sending.",
    icon: LockKeyhole,
  },
  {
    title: "User approval by default",
    description:
      "Approval-gated mode is default. You review and approve claims before they are sent.",
    icon: ShieldCheck,
  },
  {
    title: "Transparent workflows",
    description:
      "Users can review claim drafts, policy evidence, and Assistant explanations at every step.",
    icon: Eye,
  },
];

export function SecurityPrinciples() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40">
        <div className="mb-12">
          <Badge variant="secondary" className="mb-4">
            Principles
          </Badge>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            How we approach security
          </h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {principles.map((principle) => (
            <Card key={principle.title} className="bg-card">
              <CardHeader>
                <div className="flex size-10 items-center justify-center rounded-lg bg-secondary">
                  <principle.icon className="size-5 text-foreground" />
                </div>
                <CardTitle className="mt-4">{principle.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm leading-relaxed">
                  {principle.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
