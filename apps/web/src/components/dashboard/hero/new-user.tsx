"use client";

import { UploadCloud } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function HeroNewUser({ onBrowseFiles }: { onBrowseFiles: () => void }) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    toast.success("Receipt added to upload queue.");
  };

  return (
    <Card className="border-neutral-200">
      <CardContent className="p-8 lg:p-12">
        <div className="text-center max-w-xl mx-auto">
          <h2 className="text-xl font-semibold text-neutral-900 mb-2">
            Start by adding your first purchase
          </h2>
          <p className="text-neutral-600 mb-6">
            Upload a receipt or connect Gmail so ClaimIt can begin monitoring eligible price
            protection windows.
          </p>

          <button
            type="button"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={onBrowseFiles}
            className={cn(
              "w-full border-2 border-dashed rounded-xl p-12 transition-colors cursor-pointer",
              isDragging
                ? "border-brand-primary-400 bg-brand-primary-50"
                : "border-neutral-300 hover:border-neutral-400",
            )}
          >
            <UploadCloud className="w-12 h-12 mx-auto text-neutral-400 mb-4" aria-hidden="true" />
            <span className="inline-flex items-center justify-center px-4 py-2 rounded-md bg-brand-primary-500 hover:bg-brand-primary-600 text-neutral-0 text-sm font-medium mb-3">
              Browse files
            </span>
            <p className="text-sm text-neutral-500">or drag and drop your receipts here</p>
          </button>

          <p className="text-xs text-neutral-500 mt-4">PDF, PNG, or JPG up to 10 MB.</p>
          <Link
            href="/settings/gmail"
            className="text-sm text-brand-primary-500 hover:text-brand-primary-600 mt-2 inline-block"
          >
            Or connect Gmail →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
