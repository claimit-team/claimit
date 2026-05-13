"use client";

import { AlertTriangle, FileQuestion } from "lucide-react";

interface ConfidenceBannerProps {
  overallConfidence: number;
  lowConfidenceFields: string[];
  isMostlyFailed?: boolean;
}

export function ConfidenceBanner({
  overallConfidence,
  lowConfidenceFields,
  isMostlyFailed = false,
}: ConfidenceBannerProps) {
  if (overallConfidence >= 0.95 && lowConfidenceFields.length === 0 && !isMostlyFailed) {
    return null;
  }

  if (isMostlyFailed || (overallConfidence < 0.3 && lowConfidenceFields.length >= 3)) {
    return (
      <div className="flex items-start gap-3 rounded-lg bg-neutral-50 p-4">
        <FileQuestion className="mt-0.5 size-5 shrink-0 text-neutral-500" aria-hidden />
        <div>
          <p className="text-sm font-medium text-neutral-700">Couldn&apos;t extract most details</p>
          <p className="mt-0.5 text-sm text-neutral-500">
            Please fill in the information manually.
          </p>
        </div>
      </div>
    );
  }

  if (lowConfidenceFields.length > 0) {
    const fieldNames = lowConfidenceFields
      .map((field) => field.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()))
      .join(", ");

    return (
      <div className="flex items-start gap-3 rounded-lg bg-semantic-warning-bg p-4">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-semantic-warning" aria-hidden />
        <div>
          <p className="text-sm font-medium text-neutral-700">
            We weren&apos;t sure about a couple of fields
          </p>
          <p className="mt-0.5 text-sm text-neutral-500">
            Please double-check <span className="font-medium">{fieldNames}</span> before confirming.
          </p>
        </div>
      </div>
    );
  }

  return null;
}
