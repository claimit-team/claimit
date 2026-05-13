"use client";

import { CheckCircle, Clock, Info, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { mockPreferences } from "@/components/settings/settings-mock";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type SendMode = "approval" | "auto";

type PreferenceSettings = {
  selectedMode: SendMode;
  autoSendDelaySeconds: number;
  autoSendDelayLabel: string;
};

const initialSettings: PreferenceSettings = {
  selectedMode: mockPreferences.defaultSendMode,
  autoSendDelaySeconds: 300,
  autoSendDelayLabel: "5 minutes",
};

const perPlatformOverrides = [
  { platform: "Best Buy", status: "Coming soon" },
  { platform: "Hilton", status: "Coming soon" },
  { platform: "Southwest", status: "Coming soon" },
];

export default function PreferencesPage() {
  const [settings, setSettings] = useState<PreferenceSettings>(initialSettings);
  const [isLoading] = useState(false);
  const [hasError] = useState(false);

  const handleModeChange = (value: string) => {
    setSettings((prev) => ({
      ...prev,
      selectedMode: value as SendMode,
    }));
  };

  const handleSave = () => {
    toast.success("Send preferences saved in this mock flow.");
  };

  const handleReset = () => {
    setSettings(initialSettings);
    toast("Preferences reset to defaults.");
  };

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

  if (hasError) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-neutral-900">Send preferences</h1>
          <p className="text-neutral-700">
            Choose how ClaimIt handles claim drafts and eligible email claim sending.
          </p>
        </div>
        <Alert variant="destructive">
          <Info className="size-4" aria-hidden="true" />
          <AlertDescription>Preferences could not be loaded.</AlertDescription>
        </Alert>
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
          <RadioGroup
            value={settings.selectedMode}
            onValueChange={handleModeChange}
            className="space-y-4"
          >
            <Label
              htmlFor="approval"
              className={cn(
                "flex cursor-pointer rounded-lg border-2 p-4 transition-all",
                settings.selectedMode === "approval"
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
                      settings.selectedMode === "approval"
                        ? "text-brand-primary-600"
                        : "text-neutral-500",
                    )}
                    aria-hidden="true"
                  />
                  <span
                    className={cn(
                      "font-medium",
                      settings.selectedMode === "approval"
                        ? "text-brand-primary-700"
                        : "text-neutral-900",
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
                settings.selectedMode === "auto"
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
                      settings.selectedMode === "auto"
                        ? "text-brand-primary-600"
                        : "text-neutral-500",
                    )}
                    aria-hidden="true"
                  />
                  <span
                    className={cn(
                      "font-medium",
                      settings.selectedMode === "auto"
                        ? "text-brand-primary-700"
                        : "text-neutral-900",
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

      {settings.selectedMode === "auto" ? (
        <Card className="border-neutral-200 bg-neutral-0">
          <CardHeader>
            <CardTitle className="text-neutral-900">Cancel window</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-3">
                <Clock className="size-5 text-brand-primary-500" aria-hidden="true" />
                <span className="text-2xl font-semibold text-neutral-900">
                  {settings.autoSendDelayLabel}
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
          className="border-neutral-200 text-neutral-700 hover:bg-neutral-100"
        >
          Reset
        </Button>
        <Button
          type="button"
          onClick={handleSave}
          className="bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600"
        >
          Save changes
        </Button>
      </div>

      <p className="text-sm text-neutral-500">
        You can still review individual claims from the claim detail page. Some claim types always
        require manual action.
      </p>
    </div>
  );
}
