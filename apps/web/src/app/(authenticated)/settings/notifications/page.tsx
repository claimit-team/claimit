"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileEdit,
  Info,
  LayoutDashboard,
  Mail,
  Send,
  Smartphone,
  TrendingDown,
  XCircle,
} from "lucide-react";
import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

type EventType = {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  icon: ComponentType<{ className?: string }>;
};

type Channel = {
  label: string;
  status: string;
};

const initialEventTypes: EventType[] = [
  {
    key: "price_dropped",
    label: "Price drop detected",
    description: "When ClaimIt detects an eligible price drop.",
    enabled: true,
    icon: TrendingDown,
  },
  {
    key: "claim_drafted",
    label: "Claim drafted",
    description: "When claim material is ready for review.",
    enabled: true,
    icon: FileEdit,
  },
  {
    key: "claim_queued_auto",
    label: "Auto-send queued",
    description: "When an eligible email claim enters the 5-minute send queue.",
    enabled: true,
    icon: Send,
  },
  {
    key: "claim_denied",
    label: "Claim denied",
    description: "When you record or import a denied outcome.",
    enabled: true,
    icon: XCircle,
  },
  {
    key: "claim_resolved_success",
    label: "Claim resolved",
    description: "When you mark a claim approved or resolved.",
    enabled: true,
    icon: CheckCircle2,
  },
  {
    key: "low_confidence_extract",
    label: "Low confidence extraction",
    description: "When ClaimIt needs you to confirm extracted purchase details.",
    enabled: true,
    icon: AlertTriangle,
  },
  {
    key: "first_time_dashboard",
    label: "First-time dashboard",
    description: "When your dashboard is ready after onboarding.",
    enabled: true,
    icon: LayoutDashboard,
  },
  {
    key: "update_needed_reminders",
    label: "Update needed reminders",
    description: "When a submitted claim needs you to report the outcome.",
    enabled: true,
    icon: Clock,
  },
];

const channels: Channel[] = [
  { label: "Email notifications", status: "Coming soon" },
  { label: "Push notifications", status: "Coming soon" },
];

export default function NotificationsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError] = useState(false);
  const [eventTypes, setEventTypes] = useState<EventType[]>(initialEventTypes);
  const [savedEventTypes, setSavedEventTypes] = useState<EventType[]>(initialEventTypes);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  const handleToggle = (key: string) => {
    setEventTypes((prev) =>
      prev.map((event) => (event.key === key ? { ...event, enabled: !event.enabled } : event)),
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    setSavedEventTypes([...eventTypes]);
    setIsSaving(false);
    toast.success("Notification settings saved in this mock flow.");
  };

  const handleReset = () => {
    setEventTypes([...savedEventTypes]);
    toast.info("Settings reset to last saved state.");
  };

  const hasChanges = JSON.stringify(eventTypes) !== JSON.stringify(savedEventTypes);

  if (hasError) {
    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Notification settings could not be loaded.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-neutral-900">Notifications</h1>
        <p className="text-sm text-neutral-700">
          Choose which ClaimIt events can surface in your notification center and proactive
          Assistant panel.
        </p>
      </div>

      <Card className="border-neutral-200 bg-neutral-0">
        <CardHeader className="pb-0">
          <CardTitle className="text-lg text-neutral-900">Event notifications</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={`sk-${String(i)}`}>
                  <div className="flex items-center justify-between py-3">
                    <div className="flex flex-1 items-start gap-3">
                      <Skeleton className="mt-0.5 h-5 w-5" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-64" />
                      </div>
                    </div>
                    <Skeleton className="h-5 w-8" />
                  </div>
                  {i < 7 ? <Separator className="bg-neutral-200" /> : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-0">
              {eventTypes.map((event, index) => {
                const Icon = event.icon;
                return (
                  <div key={event.key}>
                    <div className="flex items-center justify-between py-3">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <Icon
                          className="mt-0.5 size-5 shrink-0 text-neutral-500"
                          aria-hidden="true"
                        />
                        <div className="min-w-0 space-y-0.5">
                          <label
                            htmlFor={event.key}
                            className="block cursor-pointer text-sm font-medium text-neutral-900"
                          >
                            {event.label}
                          </label>
                          <p className="text-xs text-neutral-700">{event.description}</p>
                        </div>
                      </div>
                      <Switch
                        id={event.key}
                        checked={event.enabled}
                        onCheckedChange={() => handleToggle(event.key)}
                        className="ml-4 shrink-0 data-checked:bg-brand-primary-500"
                      />
                    </div>
                    {index < eventTypes.length - 1 ? (
                      <Separator className="bg-neutral-200" />
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-neutral-200 bg-neutral-50">
        <CardHeader className="pb-0">
          <div className="flex items-center gap-2">
            <Info className="size-4 text-brand-primary-500" aria-hidden="true" />
            <CardTitle className="text-sm text-neutral-900">
              About proactive Assistant messages
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          <p className="text-sm text-neutral-700">
            Some notifications can open the Assistant panel with context and quick actions. Muting
            an event type prevents that proactive surface in this mock UI.
          </p>
        </CardContent>
      </Card>

      <Card className="border-neutral-200 bg-neutral-0">
        <CardHeader className="pb-0">
          <CardTitle className="text-lg text-neutral-900">Channels</CardTitle>
          <CardDescription className="text-neutral-700">
            For MVP, this screen controls in-app event visibility. Email and push delivery settings
            are shown as future options.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="space-y-0">
            {channels.map((channel, index) => (
              <div key={channel.label}>
                <div className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    {channel.label === "Email notifications" ? (
                      <Mail className="size-5 text-neutral-400" aria-hidden="true" />
                    ) : (
                      <Smartphone className="size-5 text-neutral-400" aria-hidden="true" />
                    )}
                    <span className="text-sm text-neutral-500">{channel.label}</span>
                  </div>
                  <Badge
                    variant="secondary"
                    className="bg-neutral-100 font-normal text-neutral-500"
                  >
                    {channel.status}
                  </Badge>
                </div>
                {index < channels.length - 1 ? <Separator className="bg-neutral-200" /> : null}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={handleReset}
          disabled={!hasChanges || isSaving}
          className="w-full border-neutral-200 text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 sm:w-auto"
        >
          Reset
        </Button>
        <Button
          type="button"
          onClick={() => void handleSave()}
          disabled={!hasChanges || isSaving}
          className="w-full bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600 sm:w-auto"
        >
          {isSaving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
