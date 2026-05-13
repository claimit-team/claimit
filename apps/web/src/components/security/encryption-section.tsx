import { Lock, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function EncryptionSection() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="mb-12">
          <Badge variant="secondary" className="mb-4">
            Encryption
          </Badge>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Encryption and transport
          </h2>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="bg-card">
            <CardHeader>
              <div className="flex size-10 items-center justify-center rounded-lg bg-secondary">
                <Lock className="size-5 text-foreground" />
              </div>
              <CardTitle className="mt-4">In transit</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-sm leading-relaxed">
                All data transmitted between your browser and ClaimIt uses HTTPS/TLS encryption to
                protect information in transit.
              </CardDescription>
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardHeader>
              <div className="flex size-10 items-center justify-center rounded-lg bg-secondary">
                <Shield className="size-5 text-foreground" />
              </div>
              <CardTitle className="mt-4">At rest</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-sm leading-relaxed">
                ClaimIt uses managed encryption at rest from cloud providers where applicable to
                protect stored data.
              </CardDescription>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
