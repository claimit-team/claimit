import { Cloud, Database, FileText, Key } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const storageInfo = [
  {
    icon: Cloud,
    title: "Application hosting",
    description: "Application services are hosted on Google Cloud infrastructure.",
  },
  {
    icon: FileText,
    title: "Receipts and evidence",
    description: "Receipts and evidence screenshots may be stored in cloud object storage.",
  },
  {
    icon: Database,
    title: "Application data",
    description:
      "Purchase, claim, policy, conversation, and notification records are stored in the application database.",
  },
  {
    icon: Key,
    title: "Secrets and tokens",
    description: "Authentication tokens and secrets are handled through secure secret management.",
  },
];

export function DataStorageSection() {
  return (
    <section>
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-28">
        <div className="mb-12">
          <Badge variant="secondary" className="mb-4">
            Data Storage
          </Badge>
          <h2 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Where data is stored
          </h2>
        </div>
        <div className="grid items-start gap-6 sm:grid-cols-2">
          {storageInfo.map((item) => (
            <div key={item.title} className="flex gap-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
                <item.icon className="size-5 text-foreground" />
              </div>
              <div>
                <h3 className="font-medium text-foreground">{item.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
