"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type UserLike = {
  name?: string | null;
  provider_avatar_url?: string | null;
  custom_avatar_url?: string | null;
};

interface UserAvatarProps {
  user: UserLike | null | undefined;
  size?: "sm" | "default" | "lg" | "xl";
  className?: string;
}

const SIZE_CLASS: Record<NonNullable<UserAvatarProps["size"]>, string> = {
  sm: "w-6 h-6 text-xs",
  default: "w-8 h-8 text-sm",
  lg: "w-10 h-10 text-sm",
  xl: "w-16 h-16 text-lg",
};

function getInitials(name: string | undefined | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0][0] ?? "?").toUpperCase();
  const first = parts[0][0] ?? "";
  const last = parts[parts.length - 1][0] ?? "";
  return (first + last).toUpperCase();
}

export function UserAvatar({ user, size = "default", className }: UserAvatarProps) {
  const displayUrl = user?.custom_avatar_url ?? user?.provider_avatar_url ?? null;
  const initials = getInitials(user?.name);

  return (
    <Avatar className={cn(SIZE_CLASS[size], className)}>
      {displayUrl ? <AvatarImage src={displayUrl} alt="" /> : null}
      <AvatarFallback className="bg-brand-primary-100 font-medium text-brand-primary-700">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
