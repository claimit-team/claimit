"use client";

import { FileText, Image as ImageIcon, Loader2, UploadCloud, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface SelectedFile {
  name: string;
  sizeLabel: string;
  type: "pdf" | "png" | "jpg";
}

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileType(file: File): "pdf" | "png" | "jpg" | null {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "pdf" || file.type === "application/pdf") return "pdf";
  if (ext === "png" || file.type === "image/png") return "png";
  if (ext === "jpg" || ext === "jpeg" || file.type === "image/jpeg") return "jpg";
  return null;
}

/**
 * Single-file onboarding upload surface. Batch 6 `/upload` may introduce a richer queue;
 * kept local to onboarding until those requirements land.
 */
export function OnboardingUploadStep() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const validateAndSetFile = useCallback((file: File) => {
    setError(null);

    const fileType = getFileType(file);
    if (!fileType) {
      setError("Unsupported file type. Use PDF, PNG, or JPG.");
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError("File is too large. Use a file under 10 MB.");
      return;
    }

    setSelectedFile({
      name: file.name,
      sizeLabel: formatFileSize(file.size),
      type: fileType,
    });
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLButtonElement>) => {
      e.preventDefault();
      setIsDragOver(false);

      if (isUploading) return;

      const file = e.dataTransfer.files[0];
      if (file) validateAndSetFile(file);
    },
    [isUploading, validateAndSetFile],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (!isUploading) setIsDragOver(true);
    },
    [isUploading],
  );

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) validateAndSetFile(file);
    },
    [validateAndSetFile],
  );

  const handleBrowseClick = useCallback(() => {
    if (!isUploading) fileInputRef.current?.click();
  }, [isUploading]);

  const handleRemoveFile = useCallback(() => {
    setSelectedFile(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleUploadAndFinish = useCallback(async () => {
    if (!selectedFile || isUploading) return;

    setIsUploading(true);

    await new Promise((resolve) => setTimeout(resolve, 1500));

    toast.success("Receipt uploaded (mock flow).");
    setIsUploading(false);

    router.push("/dashboard");
  }, [selectedFile, isUploading, router]);

  const FileIcon = selectedFile?.type === "pdf" ? FileText : ImageIcon;

  return (
    <Card className="w-full border-neutral-200 bg-neutral-0 shadow-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-xl text-neutral-900">Add your first purchase</CardTitle>
        <CardDescription className="text-neutral-700">
          Want to see how ClaimIt works? Upload a recent receipt now, or skip and add one later from
          your dashboard.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <button
          type="button"
          disabled={isUploading}
          aria-label="Upload receipt — drop files here or browse"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={handleBrowseClick}
          className={`flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary-500/25 disabled:cursor-not-allowed disabled:opacity-50 ${
            isDragOver
              ? "border-brand-primary-500 bg-brand-primary-500/5"
              : "border-neutral-300 bg-neutral-0 hover:border-brand-primary-400"
          }`}
        >
          <UploadCloud className="mb-3 size-10 text-neutral-500" aria-hidden="true" />
          <p className="mb-1 text-sm font-medium text-neutral-900">Drop files here or browse</p>
          <p className="mb-3 text-xs text-neutral-500">PDF, PNG, or JPG up to 10 MB</p>
          <p className="text-center text-xs text-neutral-500">
            Try a recent Best Buy purchase, hotel reservation, or flight booking.
          </p>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
          onChange={handleFileInput}
          className="sr-only"
          aria-label="Upload receipt file"
        />

        {error ? (
          <div className="rounded-md bg-semantic-danger-bg p-3 text-sm text-semantic-danger">
            {error}
          </div>
        ) : null}

        {selectedFile && !error ? (
          <div className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
            <FileIcon className="size-5 shrink-0 text-neutral-500" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-neutral-900">{selectedFile.name}</p>
              <p className="text-xs text-neutral-500">{selectedFile.sizeLabel}</p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleRemoveFile();
              }}
              disabled={isUploading}
              className="rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-200 hover:text-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary-500/25 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Remove file"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : null}

        <Button
          type="button"
          disabled={!selectedFile || !!error || isUploading}
          className="w-full gap-2 bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600 disabled:opacity-50"
          onClick={() => void handleUploadAndFinish()}
        >
          {isUploading ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Uploading…
            </>
          ) : (
            "Upload and finish"
          )}
        </Button>

        <div className="text-center">
          <Link
            href="/dashboard"
            className="text-sm text-neutral-500 underline-offset-4 transition-colors hover:text-brand-primary-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary-500/25"
          >
            {"I'll do this later"}
          </Link>
        </div>

        <p className="text-center text-xs text-neutral-500">
          You can connect Gmail later from Settings when you&apos;re ready.
        </p>
      </CardContent>
    </Card>
  );
}
