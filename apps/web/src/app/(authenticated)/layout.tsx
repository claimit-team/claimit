"use client";

import { Bell, ChevronDown, Menu, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { FloatingAssistant } from "@/components/layout/floating-assistant";
import { SidebarContent } from "@/components/layout/sidebar";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export default function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAssistant = pathname.startsWith("/assistant");

  return (
    <div className="min-h-screen bg-neutral-0">
      {/* Desktop sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-64 lg:flex-col bg-neutral-0 border-r border-neutral-200">
        <SidebarContent />
      </aside>

      {/* Main column */}
      <div className="lg:pl-64 min-h-screen flex flex-col">
        {/* Top header */}
        <header className="sticky top-0 z-40 h-16 bg-neutral-0 border-b border-neutral-200 flex items-center justify-between px-4 lg:px-8">
          <div className="flex items-center gap-4">
            {/* Mobile sidebar trigger */}
            <Sheet>
              <SheetTrigger
                className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "lg:hidden")}
                aria-label="Toggle menu"
              >
                <Menu className="w-5 h-5" aria-hidden="true" />
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <SidebarContent />
              </SheetContent>
            </Sheet>

            {/* Mobile logo */}
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

          {/* Header right */}
          <div className="flex items-center gap-3">
            {!isAssistant ? (
              <>
                <ThemeToggle />

                <button
                  type="button"
                  aria-label="Notifications"
                  className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "relative")}
                >
                  <Bell className="w-5 h-5 text-neutral-600" aria-hidden="true" />
                  <span className="absolute top-1 right-1 w-2 h-2 bg-semantic-danger rounded-full" />
                </button>
              </>
            ) : null}

            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(buttonVariants({ variant: "ghost" }), "flex items-center gap-2 px-2")}
              >
                <Avatar className="w-8 h-8">
                  <AvatarFallback className="bg-brand-primary-100 text-brand-primary-700 text-sm">
                    JD
                  </AvatarFallback>
                </Avatar>
                <span className="hidden sm:inline text-sm font-medium text-neutral-700">
                  John D.
                </span>
                <ChevronDown className="w-4 h-4 text-neutral-500" aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem render={<Link href="/settings" />}>Settings</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-semantic-danger">Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1">{children}</main>
      </div>

      {!isAssistant ? <FloatingAssistant /> : null}
    </div>
  );
}
