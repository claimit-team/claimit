"use client";

import { Camera, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/user/user-avatar";
import { deleteAvatar, uploadAvatar } from "@/lib/api/auth";
import { useAuthStore } from "@/store";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 2 * 1024 * 1024;

type AccountProfileCardProps = {
  name: string;
  email: string;
  isLoading?: boolean;
  isSaving?: boolean;
  onNameChange: (name: string) => void;
  onSave: () => void;
};

export function AccountProfileCard({
  name,
  email,
  isLoading,
  isSaving,
  onNameChange,
  onSave,
}: AccountProfileCardProps) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasCustomAvatar = Boolean(user?.custom_avatar_url);
  const hasProviderFallback = Boolean(user?.provider_avatar_url);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error("Avatar must be JPEG, PNG, or WEBP.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Avatar must be at most 2 MB.");
      return;
    }

    setUploading(true);
    try {
      const { user: updated } = await uploadAvatar(file);
      setUser(updated);
      toast.success("Avatar updated.");
    } catch {
      toast.error("Couldn't upload that photo. Try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      const { user: updated } = await deleteAvatar();
      setUser(updated);
      toast.success(hasProviderFallback ? "Reverted to your sign-in photo." : "Avatar removed.");
    } catch {
      toast.error("Couldn't remove that photo. Try again.");
    } finally {
      setRemoving(false);
    }
  }

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
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <UserAvatar user={user} size="xl" />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || removing}
            >
              <Camera className="mr-2 size-4" aria-hidden />
              {uploading ? "Uploading…" : hasCustomAvatar ? "Change photo" : "Upload photo"}
            </Button>
            {hasCustomAvatar ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void handleRemove()}
                disabled={uploading || removing}
                className="text-neutral-700"
              >
                <Trash2 className="mr-2 size-4" aria-hidden />
                {removing ? "Removing…" : "Remove"}
              </Button>
            ) : null}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => void handleFileChange(e)}
            className="hidden"
            aria-hidden
          />
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
