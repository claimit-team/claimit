import { Badge } from "@/components/ui/badge";

export function GmailAccessSection() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="max-w-3xl">
          <Badge variant="secondary" className="mb-4">
            Gmail Access
          </Badge>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            How we use Gmail access
          </h2>
          <div className="mt-8 space-y-6 leading-relaxed text-muted-foreground">
            <p>
              Gmail connection is optional. You can always use manual upload to add receipts and
              order confirmations to ClaimIt without connecting your email.
            </p>
            <p>
              When you do connect Gmail, ClaimIt uses that access to detect order confirmations and
              support sending eligible email claims from your mailbox when you authorize it. The
              workflow is designed to focus on purchase-related messages—order confirmations,
              shipping notifications, and claim-related replies.
            </p>
            <p>
              ClaimIt does not use Gmail data to sell your information or build advertising
              profiles. Your email content is processed to identify and manage price protection
              opportunities, not for marketing purposes.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
