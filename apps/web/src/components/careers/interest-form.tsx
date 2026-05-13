"use client";

import { Upload } from "lucide-react";
import { type ChangeEvent, type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface InterestFormProps {
  roleTitle: string;
}

export function InterestForm({ roleTitle }: InterestFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
    } else {
      setFileName(null);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Simulate a brief delay for realism
    await new Promise((resolve) => setTimeout(resolve, 800));

    toast.success("Thanks — your interest has been recorded in this mock flow.");
    setIsSubmitting(false);

    // Reset form
    const form = e.currentTarget;
    form.reset();
    setFileName(null);
  };

  return (
    <Card className="border-neutral-200">
      <CardHeader>
        <CardTitle className="text-xl text-neutral-900">Submit interest</CardTitle>
        <CardDescription className="text-neutral-700">
          Express your interest in this role. This is a mock form for the MVP site — no data is
          stored.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Hidden role field */}
          <input type="hidden" name="role" value={roleTitle} />

          {/* Visible role field */}
          <div className="space-y-2">
            <Label htmlFor="role-display" className="text-neutral-900">
              Role
            </Label>
            <Input
              id="role-display"
              type="text"
              value={roleTitle}
              disabled
              className="bg-neutral-50 text-neutral-700"
            />
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name" className="text-neutral-900">
              Name
            </Label>
            <Input
              id="name"
              name="name"
              type="text"
              placeholder="Your full name"
              required
              className="border-neutral-200"
            />
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email" className="text-neutral-900">
              Email
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              required
              className="border-neutral-200"
            />
          </div>

          {/* LinkedIn or GitHub URL */}
          <div className="space-y-2">
            <Label htmlFor="profile-url" className="text-neutral-900">
              LinkedIn or GitHub URL
            </Label>
            <Input
              id="profile-url"
              name="profileUrl"
              type="url"
              placeholder="https://linkedin.com/in/yourprofile"
              className="border-neutral-200"
            />
          </div>

          {/* Short note */}
          <div className="space-y-2">
            <Label htmlFor="note" className="text-neutral-900">
              Short note
            </Label>
            <Textarea
              id="note"
              name="note"
              placeholder="Tell us briefly why you're interested in this role..."
              rows={4}
              className="border-neutral-200 resize-none"
            />
          </div>

          {/* Resume upload (visual only) */}
          <div className="space-y-2">
            <Label htmlFor="resume" className="text-neutral-900">
              Resume (optional)
            </Label>
            <div className="relative">
              <input
                id="resume"
                name="resume"
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={handleFileChange}
                className="sr-only"
              />
              <label
                htmlFor="resume"
                className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-neutral-300 bg-neutral-50 px-4 py-6 text-sm text-neutral-700 transition-colors hover:border-neutral-400 hover:bg-neutral-100"
              >
                <Upload className="h-5 w-5 text-neutral-500" />
                {fileName ? (
                  <span className="font-medium text-neutral-900">{fileName}</span>
                ) : (
                  <span>Click to upload PDF, DOC, or DOCX</span>
                )}
              </label>
            </div>
            <p className="text-xs text-neutral-500">
              Visual only — files are not uploaded in this mock flow.
            </p>
          </div>

          {/* Submit button */}
          <Button type="submit" size="lg" disabled={isSubmitting} className="w-full sm:w-auto">
            {isSubmitting ? "Submitting..." : "Submit interest"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
