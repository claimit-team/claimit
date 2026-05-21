"use client";

import { AlertCircle, CheckCircle2, Mail, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { AuthApiError, getMe } from "@/lib/api/auth";
import {
  CALLBACK_ERROR_MESSAGES,
  connectGmail,
  disconnectGmail,
  GmailApiError,
} from "@/lib/api/gmail";
import { useAuthStore, useUIStore } from "@/store";

/**
 * App-defined OAuth scopes — these are what we request, not what's been
 * granted to a particular user. The "What access is used for" card always
 * shows this static list (it documents the app's needs); the per-user
 * connected card surfaces gmail_integration.scopes_granted instead.
 *
 * Display labels are bare scope names ("gmail.readonly", "gmail.send")
 * rather than full URIs — the granted scopes from Google come back as
 * full https://www.googleapis.com/auth/* strings, so we strip that prefix
 * for both lists below for visual symmetry.
 */
const OAUTH_SCOPE_DESCRIPTIONS: Record<string, string> = {
  "gmail.readonly": "Read order confirmations and claim-related messages for workflow context.",
  "gmail.send": "Send approved eligible email claims from your Gmail account.",
};
const APP_OAUTH_SCOPES: readonly string[] = ["gmail.readonly", "gmail.send"];

/** Strip the Google API URI prefix so granted scopes display the same way as our app-defined list. */
function shortScope(scope: string): string {
  return scope.replace(/^https:\/\/www\.googleapis\.com\/auth\//, "");
}

function formatConnectedAt(iso: string | null): string {
  if (!iso) return "—";
  // `new Date(malformed)` doesn't throw — it produces an Invalid Date whose
  // .toLocaleString() returns the literal string "Invalid Date", which would
  // leak into the connected card. Guard with isNaN(getTime()) and fall back
  // to the em-dash placeholder, matching the no-timestamp branch.
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

export function GmailSettingsContent() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isAuthLoading = useAuthStore((s) => s.isLoading);
  const setUser = useAuthStore((s) => s.setUser);
  const openUploadDialog = useUIStore((s) => s.setUploadDialogOpen);

  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);

  // OAuth callback toast: /api/v1/gmail/callback 302s back here with
  // ?status=connected or ?status=error&reason=<x>. On success we re-fetch
  // /auth/me so useAuthStore.user reflects the new connected_email +
  // scopes_granted set by the backend during the callback.
  // (StrictMode double-renders the effect; the ref-guard keeps the toast
  // and the network call singular.) We read window.location.search directly
  // instead of useSearchParams() to avoid the App Router static-prerender
  // Suspense bailout.
  const callbackHandledRef = useRef(false);
  useEffect(() => {
    if (callbackHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    if (status === "connected") {
      callbackHandledRef.current = true;
      toast.success("Gmail connected successfully.");
      // Refresh the user so the connected card shows real connected_email +
      // scopes_granted values. Failures are non-fatal — the next /auth/me
      // refetch (e.g. AuthInit on next sign-in) will catch up.
      void getMe()
        .then(setUser)
        .catch((err) => {
          if (err instanceof AuthApiError && err.code === "unauthenticated") return;
          console.error("Failed to refresh user after Gmail callback:", err);
        });
      router.replace("/settings/gmail");
    } else if (status === "error") {
      callbackHandledRef.current = true;
      const reason = params.get("reason") ?? "internal_error";
      toast.error(CALLBACK_ERROR_MESSAGES[reason] ?? CALLBACK_ERROR_MESSAGES.internal_error);
      router.replace("/settings/gmail");
    }
  }, [router, setUser]);

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
    try {
      const updated = await disconnectGmail();
      setUser(updated);
      setShowDisconnectDialog(false);
      toast.success("Gmail disconnected.");
    } catch (err) {
      const message =
        err instanceof GmailApiError
          ? err.message
          : "Could not disconnect Gmail. Please try again.";
      toast.error(message);
    } finally {
      setIsDisconnecting(false);
    }
  };

  const isLoading = isAuthLoading || !user;
  const integration = user?.gmail_integration;
  const gmailConnected = integration?.connected ?? false;
  const connectedEmail = integration?.connected_email ?? "";
  const grantedScopes = integration?.scopes_granted ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Gmail connection</h1>
        <p className="mt-1 text-sm text-neutral-700">
          Manage Gmail access for order confirmation ingestion and eligible email claim sending.
        </p>
      </div>

      {!isLoading && !user ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden="true" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Gmail status could not be loaded.</AlertDescription>
        </Alert>
      ) : null}

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
                <CardDescription className="mt-1">
                  {connectedEmail || "Gmail account connected"}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-neutral-700">
              Connected on {formatConnectedAt(integration?.connected_at ?? null)}
            </div>

            <div>
              <div className="mb-2 text-sm font-medium text-neutral-900">Scopes granted</div>
              <div className="flex flex-wrap gap-2">
                {grantedScopes.map((scope) => (
                  <Badge key={scope} variant="secondary" className="font-mono text-xs">
                    {shortScope(scope)}
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
              {APP_OAUTH_SCOPES.map((scope) => (
                <div key={scope} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                    <code className="shrink-0 rounded bg-neutral-100 px-2 py-1 font-mono text-xs text-neutral-900">
                      {scope}
                    </code>
                    <span className="text-sm text-neutral-700">
                      {OAUTH_SCOPE_DESCRIPTIONS[scope]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-neutral-200 bg-neutral-50">
        <CardHeader>
          <CardTitle className="text-base text-neutral-900">Prefer not to connect Gmail?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-neutral-700">
            You can use ClaimIt with manual receipt upload. Upload PDF, PNG, or JPG receipts from
            anywhere in the app.
          </p>
          <Button
            type="button"
            variant="outline"
            className="inline-flex items-center gap-2"
            onClick={() => openUploadDialog(true)}
          >
            <Upload className="size-4" aria-hidden="true" />
            Upload receipt
          </Button>
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

      {!isLoading && !gmailConnected ? (
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
