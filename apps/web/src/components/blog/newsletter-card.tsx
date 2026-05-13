"use client";

import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function NewsletterCard() {
  const [email, setEmail] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      toast.success("Subscribed in this mock flow.");
      setEmail("");
    }
  };

  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-6 sm:p-8">
      <h3 className="text-lg font-semibold text-neutral-900">Follow product updates</h3>
      <p className="mt-2 text-sm leading-relaxed text-neutral-600">
        Get occasional notes about ClaimIt progress, supported workflows, and product changes.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex gap-3">
        <Input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="flex-1 bg-neutral-0"
        />
        <Button type="submit">Subscribe</Button>
      </form>
    </div>
  );
}
