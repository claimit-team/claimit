"use client";

import { AlertCircle, CheckCircle2, Mail, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { mockGmail } from "@/components/settings/settings-mock";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { CALLBACK_ERROR_MESSAGES, connectGmail, GmailApiError } from "@/lib/api/gmail";
import { cn } from "@/lib/utils";

/** Only scopes we surface in mock UI — intentionally excludes gmail.modify. */
const scopeDescriptions: Partial<Record<(typeof mockGmail.scopes)[number], string>> = {
  "gmail.readonly": "Read order confirmations and claim-related messages for workflow context.",
  "gmail.send": "Send approved eligible email claims from your Gmail account.",
};

const gmailDemoMeta = {
  connectedOnLabel: "Mock connected timestamp",
  lastCheckedLabel: "Mock relative time",
  watchStatus: "Active",
  nextRenewalLabel: "Mock renewal window",
} as const;

export function GmailSettingsContent() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [mockError] = useState<string | null>(null);
  const [gmailConnected, setGmailConnected] = useState(mockGmail.connected);
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  // OAuth callback toast: /api/v1/gmail/callback 302s back here with
  // ?status=connected or ?status=error&reason=<x>. Surface it once per mount
  // (StrictMode double-renders the effect; the ref-guard keeps the toast singular).
  // We read window.location.search directly instead of useSearchParams() to
  // avoid the App Router static-prerender Suspense bailout.
  const callbackHandledRef = useRef(false);
  useEffect(() => {
    if (callbackHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    if (status === "connected") {
      callbackHandledRef.current = true;
      toast.success("Gmail connected successfully.");
      setGmailConnected(true);
      router.replace("/settings/gmail");
    } else if (status === "error") {
      callbackHandledRef.current = true;
      const reason = params.get("reason") ?? "internal_error";
      toast.error(CALLBACK_ERROR_MESSAGES[reason] ?? CALLBACK_ERROR_MESSAGES.internal_error);
      router.replace("/settings/gmail");
    }
  }, [router]);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const { authorization_url } = await connectGmail("/settings/gmail");
      window.location.href = authorization_url;
    } catch (err) {
      setIsConnecting(false);
      const message =
        err instanceof GmailApiError
          ? err.message
          : "Could not start Gmail connection. Please try again.";
      toast.error(message);
    }
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsDisconnecting(false);
    setShowDisconnectDialog(false);
    toast.success("Gmail disconnected in this mock flow.");
    setGmailConnected(false);
  };

  if (mockError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="size-4" aria-hidden="true" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Gmail status could not be loaded.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Gmail connection</h1>
        <p className="mt-1 text-sm text-neutral-700">
          Manage Gmail access for order confirmation ingestion and eligible email claim sending.
        </p>
      </div>

      {isLoading ? (
        <Card className="border-neutral-200 bg-neutral-0">
          <CardHeader>
            <Skeleton className="h-6 w-24" />
            <Skeleton className="mt-2 h-4 w-48" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-56" />
            </div>
          </CardContent>
        </Card>
      ) : gmailConnected ? (
        <Card className="border-neutral-200 bg-neutral-0">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-semantic-success-bg">
                <Mail className="size-5 text-semantic-success" aria-hidden="true" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-lg text-neutral-900">Gmail status</CardTitle>
                  <Badge className="border-transparent bg-semantic-success text-neutral-0">
                    <CheckCircle2 className="mr-1 size-3" aria-hidden="true" />
                    Connected
                  </Badge>
                </div>
                <CardDescription className="mt-1">{mockGmail.connectedEmail}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-neutral-700">
              Connected on {gmailDemoMeta.connectedOnLabel}
            </div>

            <div>
              <div className="mb-2 text-sm font-medium text-neutral-900">Scopes granted</div>
              <div className="flex flex-wrap gap-2">
                {mockGmail.scopes.map((scope) => (
                  <Badge key={scope} variant="secondary" className="font-mono text-xs">
                    {scope}
                  </Badge>
                ))}
              </div>
            </div>

            <p className="text-sm text-neutral-700">
              ClaimIt uses Gmail to help detect purchase confirmations and send eligible email
              claims according to your send preference.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-neutral-200 bg-neutral-0">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-neutral-100">
                <Mail className="size-5 text-neutral-700" aria-hidden="true" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-lg text-neutral-900">Gmail status</CardTitle>
                  <Badge variant="secondary">Not connected</Badge>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-neutral-700">
              You can still upload receipts manually, but ClaimIt will not auto-detect new purchases
              from Gmail.
            </p>
            <Button
              type="button"
              onClick={() => void handleConnect()}
              disabled={isConnecting}
              className="bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600"
            >
              {isConnecting ? "Connecting…" : "Connect Gmail"}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="border-neutral-200 bg-neutral-0">
        <CardHeader>
          <CardTitle className="text-base text-neutral-900">What access is used for</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <div className="divide-y divide-neutral-200">
              {mockGmail.scopes.map((scope) => (
                <div key={scope} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                    <code className="shrink-0 rounded bg-neutral-100 px-2 py-1 font-mono text-xs text-neutral-900">
                      {scope}
                    </code>
                    <span className="text-sm text-neutral-700">{scopeDescriptions[scope]}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {gmailConnected ? (
        <Card className="border-neutral-200 bg-neutral-0">
          <CardHeader>
            <CardTitle className="text-base text-neutral-900">Sync status</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-36" />
              </div>
            ) : (
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-neutral-700">Last checked</dt>
                  <dd className="font-medium text-neutral-900">{gmailDemoMeta.lastCheckedLabel}</dd>
                </div>
                <div>
                  <dt className="text-neutral-700">Watch status</dt>
                  <dd className="font-medium text-neutral-900">
                    <span className="inline-flex items-center gap-1">
                      <span
                        className="size-2 rounded-full bg-semantic-success"
                        aria-hidden="true"
                      />
                      {gmailDemoMeta.watchStatus}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-700">Next renewal</dt>
                  <dd className="font-medium text-neutral-900">{gmailDemoMeta.nextRenewalLabel}</dd>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-neutral-200 bg-neutral-50">
        <CardHeader>
          <CardTitle className="text-base text-neutral-900">Prefer not to connect Gmail?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-neutral-700">
            You can use ClaimIt with manual receipt upload. Upload PDF, PNG, or JPG receipts from
            the dashboard or upload page.
          </p>
          <Link
            href="/upload"
            className={cn(buttonVariants({ variant: "outline" }), "inline-flex items-center gap-2")}
          >
            <Upload className="size-4" aria-hidden="true" />
            Upload receipt
          </Link>
        </CardContent>
      </Card>

      {gmailConnected ? (
        <Card className="border-semantic-danger/20 bg-neutral-0">
          <CardHeader>
            <CardTitle className="text-base text-semantic-danger">Disconnect Gmail</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-neutral-700">
              Without Gmail, ClaimIt cannot auto-detect new purchases. You can still upload receipts
              manually.
            </p>
            <Button
              type="button"
              variant="destructive"
              onClick={() => setShowDisconnectDialog(true)}
              disabled={isDisconnecting}
              className="bg-semantic-danger hover:bg-semantic-danger/90"
            >
              Disconnect Gmail
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {!gmailConnected && !isLoading ? (
        <p className="text-sm text-neutral-700 italic">Gmail is not connected.</p>
      ) : null}

      <Dialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
        <DialogContent className="border-neutral-200 bg-neutral-0">
          <DialogHeader>
            <DialogTitle className="text-neutral-900">Disconnect Gmail?</DialogTitle>
            <DialogDescription className="text-neutral-700">
              ClaimIt will stop detecting new purchases from Gmail. Existing purchases and claims
              remain visible. You can reconnect later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowDisconnectDialog(false)}
              disabled={isDisconnecting}
              className="border-neutral-200"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDisconnect()}
              disabled={isDisconnecting}
              className="bg-semantic-danger hover:bg-semantic-danger/90"
            >
              {isDisconnecting ? "Disconnecting…" : "Disconnect Gmail"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
