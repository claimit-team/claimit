"use client";

import { ArrowRight, Menu, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store";

const navLinks = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/security", label: "Security" },
  { href: "/help", label: "Help" },
] as const;

function navLinkActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PublicHeader() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);
  const showAuthCTA = Boolean(user?.onboarded && !isLoading);

  return (
    <header className="sticky top-0 z-50 border-b border-neutral-200 bg-neutral-0/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2">
            <ShieldCheck
              className="text-brand-primary-500"
              strokeWidth={2.25}
              size={28}
              aria-hidden
            />
            <span className="text-xl font-semibold text-neutral-900">ClaimIt</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  navLinkActive(pathname, link.href)
                    ? "bg-neutral-100 text-neutral-900"
                    : "text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900",
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <ThemeToggle />
          {showAuthCTA ? (
            <Link
              href="/dashboard"
              className={cn(
                buttonVariants({ size: "sm" }),
                "gap-1.5 bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600",
              )}
            >
              Go to dashboard
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-neutral-700")}
              >
                Log in
              </Link>
              <Link
                href="/login"
                className={cn(
                  buttonVariants({ size: "sm" }),
                  "bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600",
                )}
              >
                Try free
              </Link>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <button
            type="button"
            className="rounded-md p-2 text-neutral-700"
            onClick={() => setMobileMenuOpen((o) => !o)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          >
            {mobileMenuOpen ? (
              <X className="size-5" aria-hidden />
            ) : (
              <Menu className="size-5" aria-hidden />
            )}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="border-t border-neutral-200 bg-neutral-0 md:hidden">
          <nav className="flex flex-col px-4 py-4">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "py-2 text-sm font-medium transition-colors",
                  navLinkActive(pathname, link.href)
                    ? "text-neutral-900"
                    : "text-neutral-700 hover:text-neutral-900",
                )}
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <Separator className="my-3 bg-neutral-200" />
            {showAuthCTA ? (
              <Link
                href="/dashboard"
                className={cn(
                  buttonVariants({ size: "default" }),
                  "mt-2 w-full justify-center gap-1.5 bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600",
                )}
                onClick={() => setMobileMenuOpen(false)}
              >
                Go to dashboard
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="py-2 text-sm text-neutral-700 hover:text-neutral-900"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Log in
                </Link>
                <Link
                  href="/login"
                  className={cn(
                    buttonVariants({ size: "default" }),
                    "mt-2 w-full bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600 text-center justify-center inline-flex items-center py-2",
                  )}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Try free
                </Link>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
