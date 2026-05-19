"use client";

import { AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  AccountProfileCard,
  SessionActionsCard,
  SignInProviderCard,
} from "@/components/settings/account";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AuthApiError, patchUserMe } from "@/lib/api/auth";
import { signOutUser } from "@/lib/auth-actions";
import { useAuthStore } from "@/store";

function deriveInitials(name: string): string {
  // First letter of the first two whitespace-separated words. Covers the
  // common "First Last" case and degrades cleanly for one-word display
  // names (just the first letter). Empty string falls back to "?".
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).slice(0, 2);
  return parts
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);
}

export default function AccountSettingsPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isAuthLoading = useAuthStore((s) => s.isLoading);
  const setUser = useAuthStore((s) => s.setUser);

  const [name, setName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync the local edit buffer when the underlying user changes (initial
  // load, post-save replacement, or onAuthStateChanged switching accounts).
  useEffect(() => {
    if (user) setName(user.name);
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    if (name.trim() === user.name) {
      // Nothing changed — skip the network round-trip entirely.
      toast.info("No changes to save.");
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const updated = await patchUserMe({ name: name.trim() });
      setUser(updated);
      toast.success("Account changes saved.");
    } catch (err) {
      const message =
        err instanceof AuthApiError
          ? err.message
          : "Could not save your changes. Please try again.";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutUser();
      router.push("/login");
    } catch (err) {
      // Mirrors the authenticated layout's sidebar sign-out: surface the
      // error rather than silently failing, then let onAuthStateChanged
      // do its thing if the SDK eventually clears anyway.
      const message = err instanceof Error ? err.message : "Sign out failed.";
      toast.error(message);
    }
  };

  const isLoading = isAuthLoading || !user;

  return (
    <div className="space-y-6">
      {errorMessage ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden="true" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <AccountProfileCard
        name={name}
        email={user?.email ?? ""}
        initials={user ? deriveInitials(user.name) : "?"}
        isLoading={isLoading}
        isSaving={isSaving}
        onNameChange={setName}
        onSave={() => void handleSave()}
      />

      {user ? (
        <>
          <SignInProviderCard provider="Google" email={user.email} />
          <SessionActionsCard onSignOut={() => void handleSignOut()} />
        </>
      ) : null}
    </div>
  );
}
