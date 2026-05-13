"use client";

import { Bell, CreditCard, Mail, Sliders, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const settingsNavItems = [
  { label: "Account", href: "/settings/account", icon: User },
  { label: "Gmail", href: "/settings/gmail", icon: Mail },
  { label: "Preferences", href: "/settings/preferences", icon: Sliders },
  { label: "Notifications", href: "/settings/notifications", icon: Bell },
  { label: "Billing", href: "/settings/billing", icon: CreditCard },
] as const;

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <>
      <nav className="hidden w-[240px] shrink-0 md:block" aria-label="Settings sections">
        <ul className="space-y-1">
          {settingsNavItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex h-10 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary-500",
                    isActive
                      ? "bg-brand-primary-50 text-brand-primary-700"
                      : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-5 shrink-0",
                      isActive ? "text-brand-primary-700" : "text-neutral-500",
                    )}
                    aria-hidden="true"
                  />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="-mx-4 mb-6 px-4 md:hidden">
        <nav
          className="flex gap-1 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Settings sections"
        >
          {settingsNavItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary-500",
                  isActive
                    ? "bg-brand-primary-50 text-brand-primary-700"
                    : "text-neutral-700 hover:bg-neutral-100",
                )}
              >
                <Icon
                  className={cn("size-4", isActive ? "text-brand-primary-700" : "text-neutral-500")}
                  aria-hidden="true"
                />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </>
  );
}
