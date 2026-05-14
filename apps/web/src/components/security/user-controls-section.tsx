import { Bell, CheckSquare, Unplug, Upload } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const controls = [
  {
    title: "Disconnect Gmail",
    description: "Revoke Gmail access at any time from your settings.",
    icon: Unplug,
    href: "/settings/gmail",
  },
  {
    title: "Use upload instead",
    description: "Skip Gmail entirely and manually upload receipts.",
    icon: Upload,
    href: "/settings/gmail",
  },
  {
    title: "Choose approval mode",
    description: "Control whether claims require manual approval or auto-send.",
    icon: CheckSquare,
    href: "/settings/preferences",
  },
  {
    title: "Manage notifications",
    description: "Configure how and when ClaimIt alerts you about claims.",
    icon: Bell,
    href: "/settings/notifications",
  },
];

export function UserControlsSection() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40">
        <div className="mb-12">
          <Badge variant="secondary" className="mb-4">
            User Controls
          </Badge>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            You&apos;re in control
          </h2>
          <p className="mt-4 max-w-3xl leading-relaxed text-muted-foreground">
            ClaimIt gives you full control over your data and how the service operates on your
            behalf.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          {controls.map((control) => (
            <Link key={control.title} href={control.href}>
              <Card className="h-full bg-card transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
                <CardHeader>
                  <div className="flex size-10 items-center justify-center rounded-lg bg-secondary">
                    <control.icon className="size-5 text-foreground" />
                  </div>
                  <CardTitle className="mt-4">{control.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm leading-relaxed">
                    {control.description}
                  </CardDescription>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
