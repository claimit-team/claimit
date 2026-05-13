"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

type AccountProfileCardProps = {
  name: string;
  email: string;
  initials: string;
  isLoading?: boolean;
  isSaving?: boolean;
  onNameChange: (name: string) => void;
  onSave: () => void;
};

export function AccountProfileCard({
  name,
  email,
  initials,
  isLoading,
  isSaving,
  onNameChange,
  onSave,
}: AccountProfileCardProps) {
  if (isLoading) {
    return (
      <Card className="border-neutral-200 bg-neutral-0">
        <CardHeader>
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <Skeleton className="size-16 rounded-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-9 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-9 w-full" />
          </div>
          <Skeleton className="h-9 w-28" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-neutral-200 bg-neutral-0">
      <CardHeader>
        <CardTitle className="text-neutral-900">Account</CardTitle>
        <CardDescription className="text-neutral-700">
          Update your profile details and account access settings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-4">
          <Avatar className="size-16">
            <AvatarFallback className="bg-brand-primary-50 text-lg font-medium text-brand-primary-700">
              {initials}
            </AvatarFallback>
          </Avatar>
        </div>

        <div className="space-y-2">
          <Label htmlFor="account-name" className="text-neutral-900">
            Name
          </Label>
          <Input
            id="account-name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            className="border-neutral-200 bg-neutral-0"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="account-email" className="text-neutral-900">
            Email
          </Label>
          <Input
            id="account-email"
            value={email}
            readOnly
            className="cursor-not-allowed border-neutral-200 bg-neutral-50"
          />
          <p className="text-xs text-neutral-700">
            Email comes from your Google sign-in and cannot be edited here.
          </p>
        </div>

        <Button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className="bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600"
        >
          {isSaving ? "Saving…" : "Save changes"}
        </Button>
      </CardContent>
    </Card>
  );
}
