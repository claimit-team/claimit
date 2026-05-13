import { Mail } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type SignInProviderCardProps = {
  provider: string;
  email: string;
};

export function SignInProviderCard({ provider, email }: SignInProviderCardProps) {
  return (
    <Card className="border-neutral-200 bg-neutral-0">
      <CardHeader>
        <CardTitle className="text-neutral-900">Sign-in method</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-neutral-100">
              <Mail className="size-5 text-neutral-700" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-neutral-900">{provider}</p>
              <p className="truncate text-sm text-neutral-700">{email}</p>
            </div>
          </div>
          <Badge
            variant="secondary"
            className="border-transparent bg-semantic-success-bg text-semantic-success"
          >
            Connected
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
