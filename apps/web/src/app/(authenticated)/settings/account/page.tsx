"use client";

import { AlertCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  AccountProfileCard,
  DangerZoneCard,
  SessionActionsCard,
  SignInProviderCard,
} from "@/components/settings/account";
import { mockUser } from "@/components/settings/settings-mock";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const initialMockData = {
  user: {
    name: mockUser.displayName,
    email: mockUser.email,
    initials: mockUser.initials,
    provider: "Google",
  },
  isLoading: false,
  isSaving: false,
  mockError: null as string | null,
};

export default function AccountSettingsPage() {
  const [state, setState] = useState(initialMockData);
  const [name, setName] = useState(state.user.name);

  const handleSave = () => {
    setState((prev) => ({ ...prev, isSaving: true }));

    setTimeout(() => {
      setState((prev) => ({
        ...prev,
        isSaving: false,
        user: { ...prev.user, name },
      }));
      toast.success("Account changes saved in this mock flow.");
    }, 800);
  };

  const handleSignOut = () => {
    toast.success("Signed out in this mock flow.");
  };

  const handleDeleteAccount = () => {
    toast.success("Delete account confirmed in this mock flow.");
  };

  return (
    <div className="space-y-6">
      {state.mockError ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden="true" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{state.mockError}</AlertDescription>
        </Alert>
      ) : null}

      <AccountProfileCard
        name={name}
        email={state.user.email}
        initials={state.user.initials}
        isLoading={state.isLoading}
        isSaving={state.isSaving}
        onNameChange={setName}
        onSave={handleSave}
      />

      <SignInProviderCard provider={state.user.provider} email={state.user.email} />

      <SessionActionsCard onSignOut={handleSignOut} />

      <DangerZoneCard onDeleteAccount={handleDeleteAccount} />
    </div>
  );
}
