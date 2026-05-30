"use client";

import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { subscribeNewsletter } from "@/lib/api/newsletter";

export function NewsletterCard() {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await subscribeNewsletter({
        email: email.trim(),
        website: website.trim() || undefined,
      });
      setIsSubscribed(true);
      setEmail("");
      setWebsite("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Couldn't subscribe right now. Try again shortly.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-6 sm:p-8">
      <h3 className="text-lg font-semibold text-neutral-900">Follow product updates</h3>
      <p className="mt-2 text-sm leading-relaxed text-neutral-600">
        Get occasional notes about ClaimIt progress, supported workflows, and product changes.
      </p>

      {isSubscribed ? (
        <p className="mt-6 text-sm text-neutral-700">Subscribed. Watch for updates from ClaimIt.</p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
            className="sr-only"
          />
          <div className="flex gap-3">
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={isSubmitting}
              className="flex-1 bg-neutral-0"
            />
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Subscribing..." : "Subscribe"}
            </Button>
          </div>
          {errorMessage && <p className="text-sm text-neutral-600">{errorMessage}</p>}
        </form>
      )}
    </div>
  );
}
