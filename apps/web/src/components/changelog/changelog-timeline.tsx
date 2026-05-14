import { Building2, Code, Package, Palette, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface ChangelogEntry {
  date: string;
  category: "Product" | "Design" | "Engineering" | "Security" | "Company";
  title: string;
  description: string;
  details?: string[];
}

interface ChangelogMonth {
  month: string;
  entries: ChangelogEntry[];
}

const mockChangelogData: ChangelogMonth[] = [
  {
    month: "May 2026",
    entries: [
      {
        date: "May 13, 2026",
        category: "Product",
        title: "Dashboard states clarified",
        description:
          "Dashboard hero now changes based on purchases and user-reported approved claims.",
        details: [
          "New user upload hero",
          "Active user status overview",
          "User-reported reclaimed total variant",
        ],
      },
      {
        date: "May 12, 2026",
        category: "Design",
        title: "Public layout and navigation shell defined",
        description:
          "Header, footer, authenticated shell, sidebar, and Floating Assistant behavior documented.",
      },
      {
        date: "May 11, 2026",
        category: "Engineering",
        title: "Interfaces locked for MVP",
        description: "Shared schemas, Pub/Sub events, API contracts, and route flows were defined.",
      },
    ],
  },
  {
    month: "April 2026",
    entries: [
      {
        date: "April 30, 2026",
        category: "Product",
        title: "Four claim material types scoped",
        description:
          "Email drafts, chat scripts, in-store guides, and self-service walkthroughs were separated.",
      },
      {
        date: "April 24, 2026",
        category: "Security",
        title: "Gmail connection model drafted",
        description:
          "Receipt ingestion and eligible email-claim sending were documented with user control.",
      },
      {
        date: "April 18, 2026",
        category: "Company",
        title: "ClaimIt MVP concept created",
        description:
          "Initial product direction focused on post-purchase price protection and follow-through.",
      },
    ],
  },
];

const categoryConfig: Record<
  ChangelogEntry["category"],
  { icon: typeof Package; colorClass: string }
> = {
  Product: { icon: Package, colorClass: "bg-brand-primary-500 text-white" },
  Design: { icon: Palette, colorClass: "bg-brand-primary-700 text-white" },
  Engineering: { icon: Code, colorClass: "bg-neutral-700 text-neutral-0" },
  Security: {
    icon: Shield,
    colorClass: "bg-semantic-warning text-neutral-900",
  },
  Company: { icon: Building2, colorClass: "bg-neutral-600 text-neutral-0" },
};

export function ChangelogTimeline() {
  return (
    <section className="mb-12">
      {mockChangelogData.map((monthGroup, monthIndex) => (
        <div key={monthGroup.month} className="mb-10">
          <h2 className="mb-6 text-xl font-semibold text-neutral-900">{monthGroup.month}</h2>
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-3 top-0 h-full w-px bg-neutral-200" aria-hidden="true" />

            <div className="space-y-6">
              {monthGroup.entries.map((entry, entryIndex) => {
                const { icon: Icon, colorClass } = categoryConfig[entry.category];
                const isLastInMonth = entryIndex === monthGroup.entries.length - 1;
                const isLastMonth = monthIndex === mockChangelogData.length - 1;

                return (
                  <div key={`${entry.date}-${entry.title}`} className="relative pl-10">
                    {/* Timeline dot */}
                    <div
                      className={`absolute left-0 flex h-6 w-6 items-center justify-center rounded-full ${colorClass}`}
                      aria-hidden="true"
                    >
                      <Icon className="h-3 w-3" />
                    </div>

                    <Card className="border-neutral-200 bg-neutral-0">
                      <CardHeader className="pb-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {entry.category}
                          </Badge>
                          <span className="text-xs text-neutral-500">{entry.date}</span>
                        </div>
                        <CardTitle className="text-base text-neutral-900">{entry.title}</CardTitle>
                        <CardDescription className="text-neutral-700">
                          {entry.description}
                        </CardDescription>
                      </CardHeader>
                      {entry.details && (
                        <CardContent className="pt-0">
                          <ul className="space-y-1">
                            {entry.details.map((detail) => (
                              <li
                                key={detail}
                                className="flex items-start gap-2 text-sm text-neutral-700"
                              >
                                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-neutral-400" />
                                {detail}
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      )}
                    </Card>

                    {/* Separator between entries, but not after the last one */}
                    {!(isLastInMonth && isLastMonth) && !isLastInMonth && (
                      <div className="mt-6" aria-hidden="true" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {monthIndex < mockChangelogData.length - 1 && (
            <Separator className="mt-10 bg-neutral-200" />
          )}
        </div>
      ))}
    </section>
  );
}
