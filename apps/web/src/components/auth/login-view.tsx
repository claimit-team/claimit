"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

// Brand asset exception per design-system.md §2.5: the Google logo uses the
// official multicolor SVG and intentionally does NOT inherit currentColor.
function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 18 18" className={className ?? "size-4"} role="img">
      <title>Google</title>
      <path
        fill="#4285F4"
        d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.4673-.806 5.9564-2.1804l-2.9087-2.2581c-.806.54-1.8368.8595-3.0477.8595-2.344 0-4.3282-1.5832-5.036-3.7104H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71c-.18-.54-.2823-1.1168-.2823-1.71s.1023-1.17.2823-1.71V4.9582H.9573C.3477 6.1732 0 7.5477 0 9c0 1.4523.3477 2.8268.9573 4.0418L3.964 10.71z"
      />
      <path
        fill="#EA4335"
        d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.656 3.5795 9 3.5795z"
      />
    </svg>
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
              <ShieldCheck className="size-5 text-neutral-700" />
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
