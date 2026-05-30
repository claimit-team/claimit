"use client";

import { Bell, ChevronDown, Menu, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { type ReactNode, useEffect, useState } from "react";
import { FloatingAssistant } from "@/components/layout/floating-assistant";
import { SidebarContent } from "@/components/layout/sidebar";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { mockPlan } from "@/components/settings/settings-mock";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { UploadDialog } from "@/components/upload/upload-dialog";
import { useProactiveAssistant } from "@/hooks/useProactiveAssistant";
import { useUnreadCount } from "@/hooks/useUnreadCount";
import { signOutUser } from "@/lib/auth-actions";
import { useShowReconnectingChip } from "@/lib/sse/connection-status";
import { cn } from "@/lib/utils";
import { useAuthStore, useUIStore } from "@/store";

type ThemeChoice = "light" | "dark" | "system";

const THEME_CHOICES: ReadonlyArray<{ value: ThemeChoice; label: string }> = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

const PLAN_LABEL: Record<typeof mockPlan, string> = {
  free: "Free plan",
  pro: "Pro plan",
  family: "Family plan",
};

function getInitials(name: string | null | undefined) {
  const initials = name
    ?.trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return initials || "?";
}

function ThemeChips() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const active = (mounted ? theme : "system") as ThemeChoice;

  return (
    <div className="flex items-center gap-1 px-1.5 py-1">
      {THEME_CHOICES.map((choice) => {
        const isActive = active === choice.value;
        return (
          <button
            key={choice.value}
            type="button"
            onClick={() => setTheme(choice.value)}
            aria-pressed={isActive}
            className={cn(
              "flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
              isActive
                ? "bg-brand-primary-100 text-brand-primary-700"
                : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
            )}
          >
            {choice.label}
          </button>
        );
      })}
    </div>
  );
}

function SseReconnectChip() {
  const show = useShowReconnectingChip();
  if (!show) return null;
  return (
    <Badge variant="secondary" className="text-neutral-500 text-xs">
      Reconnecting…
    </Badge>
  );
}

export function AuthenticatedShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const isAssistant = pathname.startsWith("/assistant");
  const isClaimDetail = /^\/claims\/[^/]+$/.test(pathname);
  const fabHidden = isAssistant || isClaimDetail;
  const setClaimEmbeddedAssistantExpanded = useUIStore((s) => s.setClaimEmbeddedAssistantExpanded);
  const { unreadCount } = useUnreadCount();

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useProactiveAssistant();

  useEffect(() => {
    if (!isClaimDetail) {
      setClaimEmbeddedAssistantExpanded(false);
    }
  }, [isClaimDetail, setClaimEmbeddedAssistantExpanded]);

  const displayName = user?.name ?? user?.email ?? "User";
  const email = user?.email ?? "";
  const initials = getInitials(user?.name);

  const handleSignOut = async () => {
    await signOutUser();
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-neutral-0">
      <aside
        data-print-hide
        className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-64 lg:flex-col bg-neutral-0 border-r border-neutral-200"
      >
        <SidebarContent />
      </aside>

      <div className="lg:pl-64 min-h-screen flex flex-col">
        <header
          data-print-hide
          className="sticky top-0 z-40 h-16 bg-neutral-0 border-b border-neutral-200 flex items-center justify-between px-4 lg:px-8"
        >
          <div className="flex items-center gap-4">
            <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
              <SheetTrigger
                className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "lg:hidden")}
                aria-label="Toggle menu"
              >
                <Menu className="w-5 h-5" aria-hidden="true" />
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <SidebarContent onItemClick={() => setMobileSidebarOpen(false)} />
              </SheetContent>
            </Sheet>

            <Link href="/dashboard" className="flex items-center gap-2 lg:hidden">
              <ShieldCheck
                className="text-brand-primary-500"
                size={28}
                strokeWidth={2.25}
                aria-hidden="true"
              />
              <span className="font-semibold text-neutral-900 text-lg">ClaimIt</span>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <SseReconnectChip />
            <ThemeToggle />

            <Link
              href="/notifications"
              aria-label={
                unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"
              }
              className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "relative")}
            >
              <Bell className="w-5 h-5 text-neutral-600" aria-hidden="true" />
              {unreadCount > 0 ? (
                <span
                  aria-hidden
                  className="absolute -top-0.5 -right-0.5 inline-flex min-w-[1.125rem] h-[1.125rem] items-center justify-center rounded-full bg-brand-primary-600 px-1 text-[10px] font-semibold leading-none text-neutral-0 tabular-nums"
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </Link>

            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(buttonVariants({ variant: "ghost" }), "flex items-center gap-2 px-2")}
              >
                <Avatar className="w-8 h-8">
                  <AvatarFallback className="bg-brand-primary-100 text-brand-primary-700 text-sm">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden sm:inline text-sm font-medium text-neutral-700">
                  {displayName}
                </span>
                <ChevronDown className="w-4 h-4 text-neutral-500" aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="px-2 py-2">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-neutral-900">{displayName}</span>
                      <span className="text-xs text-neutral-500">{email}</span>
                    </div>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />

                <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                  <Badge variant="secondary" className="text-xs">
                    {PLAN_LABEL[mockPlan]}
                  </Badge>
                  <Link
                    href="/settings/billing"
                    className="text-xs font-medium text-brand-primary-600 hover:underline"
                  >
                    Manage
                  </Link>
                </div>
                <DropdownMenuSeparator />

                <DropdownMenuItem render={<Link href="/settings" />}>Settings</DropdownMenuItem>
                <DropdownMenuItem render={<Link href="/help" />}>Help and support</DropdownMenuItem>
                <DropdownMenuSeparator />

                <DropdownMenuGroup>
                  <DropdownMenuLabel className="px-2 pt-2 pb-0 text-[10px] uppercase tracking-wider text-neutral-500">
                    Theme
                  </DropdownMenuLabel>
                  <ThemeChips />
                </DropdownMenuGroup>
                <DropdownMenuSeparator />

                <DropdownMenuItem className="text-semantic-danger" onClick={handleSignOut}>
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1">{children}</main>
      </div>

      {!fabHidden ? (
        <div data-print-hide>
          <FloatingAssistant variant="default" />
        </div>
      ) : null}

      <UploadDialog />
    </div>
  );
}
