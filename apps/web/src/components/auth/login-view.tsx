"use client";

import { Loader2, Shield } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function GoogleMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-4 items-center justify-center rounded-[3px] border border-current font-sans text-[10px] font-bold leading-none",
        className,
      )}
    >
      G
    </span>
  );
}

export function LoginView() {
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleSignIn = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      toast.success("Google sign-in mock action", {
        description: "This is a demo. No actual authentication is performed.",
      });
    }, 1500);
  };

  const handleEmailSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    toast.info("Email login coming soon", {
      description: "This feature is not yet available.",
    });
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-8">
      <Card className="w-full max-w-[420px] border-neutral-200">
        <CardContent className="space-y-6">
          <div className="space-y-3 text-center">
            <div className="mx-auto flex size-10 items-center justify-center rounded-lg bg-neutral-100">
              <Shield className="size-5 text-neutral-700" />
            </div>
            <div className="space-y-1">
              <h1 className="text-xl font-semibold text-neutral-900">Sign in to ClaimIt</h1>
              <p className="text-sm leading-relaxed text-neutral-700">
                Continue to monitor purchases, review claims, and manage your claim preferences.
              </p>
            </div>
          </div>

          <Button
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full gap-3 bg-neutral-900 text-neutral-0 hover:bg-neutral-800"
            size="lg"
          >
            {isLoading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Opening Google…
              </>
            ) : (
              <>
                <GoogleMark />
                Continue with Google
              </>
            )}
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-neutral-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-neutral-0 px-2 text-neutral-500">or</span>
            </div>
          </div>

          <form onSubmit={handleEmailSubmit} className="space-y-3">
            <Input
              type="email"
              placeholder="Email address"
              disabled
              className="border-neutral-200 bg-neutral-50 text-neutral-500"
            />
            <Button
              type="submit"
              variant="outline"
              className="w-full border-neutral-200 text-neutral-500"
              size="lg"
              disabled
            >
              Continue with email
              <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-medium text-neutral-500">
                Coming soon
              </span>
            </Button>
          </form>

          <p className="text-center text-xs text-neutral-500">
            New users continue to onboarding. Returning users go to the dashboard.
          </p>

          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
            <p className="text-xs leading-relaxed text-neutral-600">
              ClaimIt uses Gmail connection only after you authorize it during onboarding or
              settings. You can also use receipt upload without connecting Gmail.{" "}
              <Link
                href="/security"
                className="font-medium text-brand-primary-500 hover:text-brand-primary-600"
              >
                Read security details
              </Link>
            </p>
          </div>

          <p className="text-center text-xs text-neutral-500">
            By continuing, you agree to the{" "}
            <Link href="/terms" className="text-brand-primary-500 hover:text-brand-primary-600">
              Terms
            </Link>{" "}
            and acknowledge the{" "}
            <Link href="/privacy" className="text-brand-primary-500 hover:text-brand-primary-600">
              Privacy Policy
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
