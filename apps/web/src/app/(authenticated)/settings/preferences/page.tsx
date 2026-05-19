"use client";

import type { SendMode } from "@claimit/mongodb-types";
import { CheckCircle, Clock, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsApiError, updateSendPreference } from "@/lib/api/settings";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store";

const perPlatformOverrides = [
  { platform: "Best Buy", status: "Coming soon" },
  { platform: "Hilton", status: "Coming soon" },
  { platform: "Southwest", status: "Coming soon" },
];

// Display label for the auto-send delay window. The numeric value is stored
// on User.send_preference.auto_send_delay_seconds; this helper renders it
// for the read-only "Cancel window" card. (Editing the delay is post-MVP.)
function describeDelay(seconds: number): string {
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  return `${seconds} seconds`;
}

export default function PreferencesPage() {
  const user = useAuthStore((s) => s.user);
  const isAuthLoading = useAuthStore((s) => s.isLoading);
  const setUser = useAuthStore((s) => s.setUser);

  // selectedMode is the *edit buffer*; savedMode tracks the last successful
  // server state and is what Reset reverts to. Both seed from the user
  // store and re-sync whenever the underlying user reference changes.
  const [selectedMode, setSelectedMode] = useState<SendMode>("approval");
  const [savedMode, setSavedMode] = useState<SendMode>("approval");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setSelectedMode(user.send_preference.default_mode);
      setSavedMode(user.send_preference.default_mode);
    }
  }, [user]);

  const handleModeChange = (value: string) => {
    setSelectedMode(value as SendMode);
  };

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      // PUT /settings/send-preference fully replaces the sub-document, so
      // we always re-send the current auto_send_delay_seconds — the UI
      // doesn't expose it for editing yet, but the backend requires it.
      const updated = await updateSendPreference({
        default_mode: selectedMode,
        auto_send_delay_seconds: user.send_preference.auto_send_delay_seconds,
      });
      setUser(updated);
      setSavedMode(updated.send_preference.default_mode);
      toast.success("Send preferences saved.");
    } catch (err) {
      const message =
        err instanceof SettingsApiError
          ? err.message
          : "Could not save preferences. Please try again.";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setSelectedMode(savedMode);
    toast("Preferences reset to last saved state.");
  };

  const isLoading = isAuthLoading || !user;
  const hasChanges = selectedMode !== savedMode;
  const autoSendDelaySeconds = user?.send_preference.auto_send_delay_seconds ?? 300;
  const autoSendDelayLabel = describeDelay(autoSendDelaySeconds);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-5 w-96" />
        </div>
        <Card className="border-neutral-200 bg-neutral-0">
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-neutral-900">Send preferences</h1>
        <p className="text-neutral-700">
          Choose how ClaimIt handles claim drafts and eligible email claim sending.
        </p>
      </div>

      <Card className="border-neutral-200 bg-neutral-0">
        <CardHeader>
          <CardTitle className="text-neutral-900">Default send mode</CardTitle>
        </CardHeader>
        <CardContent>
          <RadioGroup value={selectedMode} onValueChange={handleModeChange} className="space-y-4">
            <Label
              htmlFor="approval"
              className={cn(
                "flex cursor-pointer rounded-lg border-2 p-4 transition-all",
                selectedMode === "approval"
                  ? "border-brand-primary-500 bg-brand-primary-50"
                  : "border-neutral-200 bg-neutral-0 hover:border-neutral-300",
              )}
            >
              <RadioGroupItem
                value="approval"
                id="approval"
                className={cn(
                  "mt-1 shrink-0 border-neutral-300 data-checked:border-brand-primary-500 data-checked:bg-brand-primary-500 [&_[data-slot=radio-group-indicator]_span]:bg-neutral-0",
                )}
              />
              <div className="ml-4 flex-1">
                <div className="flex items-center gap-2">
                  <CheckCircle
                    className={cn(
                      "size-5",
                      selectedMode === "approval" ? "text-brand-primary-600" : "text-neutral-500",
                    )}
                    aria-hidden="true"
                  />
                  <span
                    className={cn(
                      "font-medium",
                      selectedMode === "approval" ? "text-brand-primary-700" : "text-neutral-900",
                    )}
                  >
                    Approve each claim
                  </span>
                </div>
                <p className="mt-1 text-sm text-neutral-700">
                  {"I'll review every claim before ClaimIt sends it."}
                </p>
                <ul className="mt-3 space-y-1">
                  <li className="flex items-center gap-2 text-sm text-neutral-600">
                    <span className="size-1 rounded-full bg-neutral-400" aria-hidden="true" />
                    Full control
                  </li>
                  <li className="flex items-center gap-2 text-sm text-neutral-600">
                    <span className="size-1 rounded-full bg-neutral-400" aria-hidden="true" />
                    Review draft wording
                  </li>
                  <li className="flex items-center gap-2 text-sm text-neutral-600">
                    <span className="size-1 rounded-full bg-neutral-400" aria-hidden="true" />
                    Recommended for most users
                  </li>
                </ul>
              </div>
            </Label>

            <Label
              htmlFor="auto"
              className={cn(
                "flex cursor-pointer rounded-lg border-2 p-4 transition-all",
                selectedMode === "auto"
                  ? "border-brand-primary-500 bg-brand-primary-50"
                  : "border-neutral-200 bg-neutral-0 hover:border-neutral-300",
              )}
            >
              <RadioGroupItem
                value="auto"
                id="auto"
                className={cn(
                  "mt-1 shrink-0 border-neutral-300 data-checked:border-brand-primary-500 data-checked:bg-brand-primary-500 [&_[data-slot=radio-group-indicator]_span]:bg-neutral-0",
                )}
              />
              <div className="ml-4 flex-1">
                <div className="flex items-center gap-2">
                  <Send
                    className={cn(
                      "size-5",
                      selectedMode === "auto" ? "text-brand-primary-600" : "text-neutral-500",
                    )}
                    aria-hidden="true"
                  />
                  <span
                    className={cn(
                      "font-medium",
                      selectedMode === "auto" ? "text-brand-primary-700" : "text-neutral-900",
                    )}
                  >
                    Send automatically
                  </span>
                </div>
                <p className="mt-1 text-sm text-neutral-700">
                  ClaimIt sends eligible email claims for me with a 5-minute cancel window.
                </p>
                <ul className="mt-3 space-y-1">
                  <li className="flex items-center gap-2 text-sm text-neutral-600">
                    <span className="size-1 rounded-full bg-neutral-400" aria-hidden="true" />
                    Faster for eligible email claims
                  </li>
                  <li className="flex items-center gap-2 text-sm text-neutral-600">
                    <span className="size-1 rounded-full bg-neutral-400" aria-hidden="true" />
                    Cancel or review during the delay
                  </li>
                  <li className="flex items-center gap-2 text-sm text-neutral-600">
                    <span className="size-1 rounded-full bg-neutral-400" aria-hidden="true" />
                    Useful for short claim windows
                  </li>
                </ul>

                <div className="mt-4 rounded-md border border-semantic-warning/20 bg-semantic-warning-bg p-3">
                  <p className="text-sm text-neutral-700">
                    <span className="font-medium">Note:</span> Auto-send only applies to eligible
                    email claims. Chat scripts, in-store guides, and self-service walkthroughs still
                    require your action.
                  </p>
                </div>
              </div>
            </Label>
          </RadioGroup>
        </CardContent>
      </Card>

      {selectedMode === "auto" ? (
        <Card className="border-neutral-200 bg-neutral-0">
          <CardHeader>
            <CardTitle className="text-neutral-900">Cancel window</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-3">
                <Clock className="size-5 text-brand-primary-500" aria-hidden="true" />
                <span className="text-2xl font-semibold text-neutral-900">
                  {autoSendDelayLabel}
                </span>
              </div>
              <Badge variant="secondary" className="text-neutral-600">
                Read-only for MVP
              </Badge>
            </div>
            <p className="mt-3 text-sm text-neutral-700">
              When auto-send is enabled, eligible email claims enter a 5-minute queue before
              sending. You can cancel, send now, or review during that window.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-neutral-200 bg-neutral-0">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle className="text-neutral-900">Per-platform overrides</CardTitle>
            <Badge variant="secondary" className="text-neutral-600">
              Coming soon
            </Badge>
          </div>
          <CardDescription className="text-neutral-700">
            Future versions may let you choose different send behavior by platform or claim type.
            For MVP, your default send mode applies globally, with per-claim override available in
            the claim review flow if implemented.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {perPlatformOverrides.map((item) => (
              <div
                key={item.platform}
                className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 p-3"
              >
                <span className="text-sm font-medium text-neutral-500">{item.platform}</span>
                <span className="text-xs text-neutral-400">{item.status}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={handleReset}
          disabled={!hasChanges || isSaving}
          className="border-neutral-200 text-neutral-700 hover:bg-neutral-100"
        >
          Reset
        </Button>
        <Button
          type="button"
          onClick={() => void handleSave()}
          disabled={!hasChanges || isSaving}
          className="bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600"
        >
          {isSaving ? "Saving…" : "Save changes"}
        </Button>
      </div>

      <p className="text-sm text-neutral-500">
        You can still review individual claims from the claim detail page. Some claim types always
        require manual action.
      </p>
    </div>
  );
}
