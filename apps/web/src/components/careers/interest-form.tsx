"use client";

import { Check, Loader2, Upload } from "lucide-react";
import { type ChangeEvent, type FormEvent, type ReactNode, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitCareersInterest } from "@/lib/api/careers";
import { cn } from "@/lib/utils";

const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const ALLOWED_RESUME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

type InterestFormProps = {
  roleSlug?: string;
  roleTitle?: string;
};

type FormErrors = {
  name?: string;
  email?: string;
  resume?: string;
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

export function InterestForm({ roleSlug, roleTitle }: InterestFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [message, setMessage] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    if (!resumeFile) {
      next.resume = "Resume is required";
    } else if (resumeFile.size > MAX_RESUME_BYTES) {
      next.resume = "Resume must be 5MB or smaller";
    } else if (resumeFile.type && !ALLOWED_RESUME_TYPES.has(resumeFile.type)) {
      next.resume = "Resume must be a PDF, DOC, or DOCX file";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setResumeFile(file);
    setFileName(file?.name ?? null);
    if (errors.resume) {
      setErrors((prev) => ({ ...prev, resume: undefined }));
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validate()) {
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    const form = event.currentTarget;
    const formData = new FormData(form);
    if (roleSlug) {
      formData.set("role_slug", roleSlug);
    }
    if (roleTitle) {
      formData.set("role_title", roleTitle);
    }
    if (resumeFile) {
      formData.set("resume", resumeFile);
    }

    try {
      await submitCareersInterest(formData);
      setIsSubmitted(true);
    } catch (error) {
      setErrors({
        submit: error instanceof Error ? error.message : "Submission failed. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setName("");
    setEmail("");
    setLinkedinUrl("");
    setGithubUrl("");
    setMessage("");
    setFileName(null);
    setResumeFile(null);
    setErrors({});
    setIsSubmitted(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  if (isSubmitted) {
    return (
      <div className="rounded-2xl bg-neutral-0 p-6 ring-1 ring-neutral-200 sm:p-8">
        <div className="text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-brand-primary-100">
            <Check className="size-6 text-brand-primary-600" aria-hidden />
          </div>
          <h3 className="mt-4 text-lg font-medium text-neutral-900">Thanks for submitting.</h3>
          <p className="mt-2 text-base leading-relaxed text-neutral-700">
            We&apos;ll reach out when we open the role you&apos;re interested in.
          </p>
          <button
            type="button"
            onClick={resetForm}
            className="mt-6 text-sm font-medium text-brand-primary-500 transition-colors duration-200 hover:text-brand-primary-600"
          >
            Submit another
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
          className="sr-only"
          defaultValue=""
        />

        {roleSlug && (
          <>
            <input type="hidden" name="role_slug" value={roleSlug} />
            <input type="hidden" name="role_title" value={roleTitle ?? ""} />
          </>
        )}

        <div className="space-y-2">
          <RequiredLabel htmlFor="name">Name</RequiredLabel>
          <Input
            id="name"
            name="name"
            type="text"
            placeholder="Your full name"
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
          <RequiredLabel htmlFor="email">Email</RequiredLabel>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="you@example.com"
            required
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
          <Label htmlFor="linkedin_url" className="text-sm font-medium text-neutral-900">
            LinkedIn
          </Label>
          <Input
            id="linkedin_url"
            name="linkedin_url"
            type="url"
            placeholder="https://linkedin.com/in/..."
            value={linkedinUrl}
            onChange={(event) => setLinkedinUrl(event.target.value)}
            className="border-neutral-200"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="github_url" className="text-sm font-medium text-neutral-900">
            GitHub
          </Label>
          <Input
            id="github_url"
            name="github_url"
            type="url"
            placeholder="https://github.com/..."
            value={githubUrl}
            onChange={(event) => setGithubUrl(event.target.value)}
            className="border-neutral-200"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="note" className="text-sm font-medium text-neutral-900">
            Short note
          </Label>
          <Textarea
            id="note"
            name="message"
            placeholder={
              roleTitle
                ? "Tell us briefly why you're interested in this role..."
                : "Tell us a bit about yourself and what interests you about ClaimIt..."
            }
            rows={4}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            className="resize-none border-neutral-200"
          />
        </div>

        <div className="space-y-2">
          <RequiredLabel htmlFor="resume">Resume</RequiredLabel>
          <input
            ref={fileInputRef}
            id="resume"
            name="resume"
            type="file"
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            required
            onChange={handleFileChange}
            className="sr-only"
          />
          <label
            htmlFor="resume"
            className={cn(
              "mt-2 flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed bg-neutral-0 px-6 py-8 transition-all duration-200 hover:border-brand-primary-300 hover:bg-brand-primary-50/30",
              errors.resume ? "border-neutral-400" : "border-neutral-300",
            )}
          >
            <div className="text-center">
              {fileName ? (
                <>
                  <p className="text-sm font-medium text-neutral-900">{fileName}</p>
                  <p className="mt-1 text-xs text-neutral-500">Click to replace</p>
                </>
              ) : (
                <>
                  <Upload className="mx-auto size-6 text-neutral-400" aria-hidden />
                  <p className="mt-2 text-sm text-neutral-700">Click to upload your resume</p>
                  <p className="mt-1 text-xs text-neutral-500">PDF, DOC, or DOCX up to 5MB</p>
                </>
              )}
            </div>
          </label>
          {errors.resume && <p className="text-sm text-neutral-600">{errors.resume}</p>}
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
                Submitting...
              </>
            ) : (
              "Submit interest"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
