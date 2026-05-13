import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const scopes = [
  {
    scope: "gmail.readonly",
    purpose:
      "Read order confirmations and claim-related replies for ingestion and workflow context.",
  },
  {
    scope: "gmail.send",
    purpose: "Send approved eligible email claims from the user's Gmail account.",
  },
  {
    scope: "gmail.modify",
    purpose: "Mark processed emails with a ClaimIt label when enabled.",
  },
];

export function OAuthScopesSection() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="mb-8">
          <Badge variant="secondary" className="mb-4">
            OAuth Scopes
          </Badge>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Gmail permissions we request
          </h2>
          <p className="mt-4 max-w-3xl leading-relaxed text-muted-foreground">
            ClaimIt requests only the Gmail scopes necessary for the price protection workflow. Here
            is a detailed breakdown of each permission and its purpose.
          </p>
        </div>
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/50 hover:bg-secondary/50">
                <TableHead className="w-[200px] font-semibold">Scope</TableHead>
                <TableHead className="font-semibold">Purpose</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scopes.map((item) => (
                <TableRow key={item.scope}>
                  <TableCell>
                    <code className="rounded bg-secondary px-2 py-1 font-mono text-sm">
                      {item.scope}
                    </code>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{item.purpose}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </section>
  );
}
