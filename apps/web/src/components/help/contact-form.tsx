"use client";

import { Check, Loader2 } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitContact } from "@/lib/api/help-contact";
import { cn } from "@/lib/utils";

type FormErrors = {
  name?: string;
  email?: string;
  subject?: string;
  message?: string;
  submit?: string;
};

function RequiredLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <Label htmlFor={htmlFor} className="text-sm font-medium text-neutral-900">
      {children}{" "}
      <span className="text-neutral-500" aria-hidden>
        *
      </span>
      <span className="sr-only">required</span>
    </Label>
  );
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const validate = (): boolean => {
    const next: FormErrors = {};

    if (!name.trim()) {
      next.name = "Name is required";
    }

    if (!email.trim()) {
      next.email = "Email is required";
    } else if (!isValidEmail(email.trim())) {
      next.email = "Please enter a valid email address";
    }

    if (!subject.trim()) {
      next.subject = "Subject is required";
    }

    if (!message.trim()) {
      next.message = "Message is required";
    } else if (message.trim().length < 10) {
      next.message = "Message must be at least 10 characters";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const resetForm = () => {
    setName("");
    setEmail("");
    setSubject("");
    setMessage("");
    setWebsite("");
    setErrors({});
    setIsSubmitted(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validate()) {
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      await submitContact({
        name: name.trim(),
        email: email.trim(),
        subject: subject.trim(),
        message: message.trim(),
        website: website.trim() || undefined,
      });
      setIsSubmitted(true);
    } catch (error) {
      setErrors({
        submit: error instanceof Error ? error.message : "Submission failed. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="rounded-2xl bg-neutral-0 p-6 ring-1 ring-neutral-200 sm:p-8">
        <div className="text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-brand-primary-100">
            <Check className="size-6 text-brand-primary-600" aria-hidden />
          </div>
          <h3 className="mt-4 text-lg font-medium text-neutral-900">Message received</h3>
          <p className="mt-2 text-base leading-relaxed text-neutral-700">
            Thanks for reaching out. We&apos;ll get back to you soon.
          </p>
          <button
            type="button"
            onClick={resetForm}
            className="mt-6 text-sm font-medium text-brand-primary-500 transition-colors duration-200 hover:text-brand-primary-600"
          >
            Send another message
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-neutral-0 p-6 ring-1 ring-neutral-200 sm:p-8">
      <form onSubmit={handleSubmit} className="space-y-6">
        {errors.submit && (
          <div className="rounded-lg bg-neutral-100 p-4 ring-1 ring-neutral-200" role="alert">
            <p className="text-sm text-neutral-700">
              <span className="font-medium">Something went wrong:</span> {errors.submit}
            </p>
          </div>
        )}

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

        <div className="space-y-2">
          <RequiredLabel htmlFor="contact-name">Name</RequiredLabel>
          <Input
            id="contact-name"
            type="text"
            placeholder="Your name"
            required
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (errors.name) {
                setErrors((prev) => ({ ...prev, name: undefined }));
              }
            }}
            className={cn("border-neutral-200", errors.name && "ring-1 ring-neutral-400")}
          />
          {errors.name && <p className="text-sm text-neutral-600">{errors.name}</p>}
        </div>

        <div className="space-y-2">
          <RequiredLabel htmlFor="contact-email">Email</RequiredLabel>
          <Input
            id="contact-email"
            type="email"
            placeholder="you@example.com"
            required
            pattern="[^\s@]+@[^\s@]+\.[^\s@]+"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (errors.email) {
                setErrors((prev) => ({ ...prev, email: undefined }));
              }
            }}
            className={cn("border-neutral-200", errors.email && "ring-1 ring-neutral-400")}
          />
          {errors.email && <p className="text-sm text-neutral-600">{errors.email}</p>}
        </div>

        <div className="space-y-2">
          <RequiredLabel htmlFor="contact-subject">Subject</RequiredLabel>
          <Input
            id="contact-subject"
            type="text"
            placeholder="Brief summary of your question"
            required
            value={subject}
            onChange={(event) => {
              setSubject(event.target.value);
              if (errors.subject) {
                setErrors((prev) => ({ ...prev, subject: undefined }));
              }
            }}
            className={cn("border-neutral-200", errors.subject && "ring-1 ring-neutral-400")}
          />
          {errors.subject && <p className="text-sm text-neutral-600">{errors.subject}</p>}
        </div>

        <div className="space-y-2">
          <RequiredLabel htmlFor="contact-message">Message</RequiredLabel>
          <Textarea
            id="contact-message"
            placeholder="Describe your question or issue..."
            rows={5}
            required
            value={message}
            onChange={(event) => {
              setMessage(event.target.value);
              if (errors.message) {
                setErrors((prev) => ({ ...prev, message: undefined }));
              }
            }}
            className={cn(
              "resize-none border-neutral-200",
              errors.message && "ring-1 ring-neutral-400",
            )}
          />
          {errors.message && <p className="text-sm text-neutral-600">{errors.message}</p>}
        </div>

        <div className="mt-6 flex justify-center">
          <Button
            type="submit"
            size="lg"
            disabled={isSubmitting}
            className="w-full bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600 sm:w-auto sm:min-w-[200px]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                Sending...
              </>
            ) : (
              "Send message"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
