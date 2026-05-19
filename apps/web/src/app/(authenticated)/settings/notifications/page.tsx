"use client";

import type { NotificationEventType } from "@claimit/mongodb-types";
import {
  AlertTriangle,
  CheckCircle2,
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
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { SettingsApiError, updateNotifications } from "@/lib/api/settings";
import { useAuthStore } from "@/store";

type EventTypeRow = {
  key: NotificationEventType;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
};

type Channel = {
  label: string;
  status: string;
};

// The 7 event types we surface in the notifications UI. Keys must match
// values in the backend NotificationEventType enum
// (claimit_mongodb_models/enums.py); a `muted_event_types` payload with
// any other key would be rejected as 422 by /settings/notifications.
//
// `update_needed_reminders` is intentionally absent — there's no matching
// enum value yet (see plan audit; the backend would 422 it).
const EVENT_TYPE_DEFS: EventTypeRow[] = [
  {
    key: "price_dropped",
    label: "Price drop detected",
    description: "When ClaimIt detects an eligible price drop.",
    icon: TrendingDown,
  },
  {
    key: "claim_drafted",
    label: "Claim drafted",
    description: "When claim material is ready for review.",
    icon: FileEdit,
  },
  {
    key: "claim_queued_auto",
    label: "Auto-send queued",
    description: "When an eligible email claim enters the 5-minute send queue.",
    icon: Send,
  },
  {
    key: "claim_denied",
    label: "Claim denied",
    description: "When you record or import a denied outcome.",
    icon: XCircle,
  },
  {
    key: "claim_resolved_success",
    label: "Claim resolved",
    description: "When you mark a claim approved or resolved.",
    icon: CheckCircle2,
  },
  {
    key: "low_confidence_extract",
    label: "Low confidence extraction",
    description: "When ClaimIt needs you to confirm extracted purchase details.",
    icon: AlertTriangle,
  },
  {
    key: "first_time_dashboard",
    label: "First-time dashboard",
    description: "When your dashboard is ready after onboarding.",
    icon: LayoutDashboard,
  },
];

const channels: Channel[] = [
  { label: "Email notifications", status: "Coming soon" },
  { label: "Push notifications", status: "Coming soon" },
];

export default function NotificationsPage() {
  const user = useAuthStore((s) => s.user);
  const isAuthLoading = useAuthStore((s) => s.isLoading);
  const setUser = useAuthStore((s) => s.setUser);

  // Keys whose toggle is currently OFF in the edit buffer. Stored as a Set
  // (keys-only) rather than mirroring the full row defs because every row
  // is enabled-by-default; muted_event_types is the only stateful bit.
  const [mutedKeys, setMutedKeys] = useState<Set<NotificationEventType>>(new Set());
  // Last successful server state — what Reset reverts to.
  const [savedMutedKeys, setSavedMutedKeys] = useState<Set<NotificationEventType>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (user) {
      const initial = new Set(user.notification_prefs.muted_event_types);
      setMutedKeys(initial);
      setSavedMutedKeys(initial);
    }
  }, [user]);

  const handleToggle = (key: NotificationEventType) => {
    setMutedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      // PUT /settings/notifications fully replaces notification_prefs, so
      // we always re-send web_push and email at their current values. The
      // UI doesn't expose those toggles yet (the "Channels" card shows
      // them as Coming Soon) — preserving them keeps the backend honest.
      const updated = await updateNotifications({
        web_push: user.notification_prefs.web_push,
        email: user.notification_prefs.email,
        muted_event_types: Array.from(mutedKeys),
      });
      setUser(updated);
      const persisted = new Set(updated.notification_prefs.muted_event_types);
      setMutedKeys(persisted);
      setSavedMutedKeys(persisted);
      toast.success("Notification settings saved.");
    } catch (err) {
      const message =
        err instanceof SettingsApiError
          ? err.message
          : "Could not save notification settings. Please try again.";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setMutedKeys(new Set(savedMutedKeys));
    toast.info("Settings reset to last saved state.");
  };

  const isLoading = isAuthLoading || !user;
  const hasChanges = useMemo(() => {
    if (mutedKeys.size !== savedMutedKeys.size) return true;
    for (const k of mutedKeys) if (!savedMutedKeys.has(k)) return true;
    return false;
  }, [mutedKeys, savedMutedKeys]);

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
              {Array.from({ length: EVENT_TYPE_DEFS.length }).map((_, i) => (
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
                  {i < EVENT_TYPE_DEFS.length - 1 ? <Separator className="bg-neutral-200" /> : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-0">
              {EVENT_TYPE_DEFS.map((event, index) => {
                const Icon = event.icon;
                const enabled = !mutedKeys.has(event.key);
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
                        checked={enabled}
                        onCheckedChange={() => handleToggle(event.key)}
                        className="ml-4 shrink-0 data-checked:bg-brand-primary-500"
                      />
                    </div>
                    {index < EVENT_TYPE_DEFS.length - 1 ? (
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
            an event type prevents that proactive surface.
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
