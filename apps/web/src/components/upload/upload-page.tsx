"use client";

import {
  Activity,
  ArrowRight,
  Edit,
  Eye,
  FileText,
  ImageIcon,
  Loader2,
  Mail,
  RotateCcw,
  ScanLine,
  UploadCloud,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  initialUploadQueue,
  mockUploadLimits,
  type UploadQueueItem,
  type UploadQueueStatus,
} from "@/lib/mock-uploads";
import { cn } from "@/lib/utils";

function HelperExplainer() {
  const steps = [
    {
      icon: ScanLine,
      title: "Extract",
      description: "ClaimIt reads purchase details from your receipt",
    },
    {
      icon: Eye,
      title: "Review",
      description: "You confirm the details before monitoring starts",
    },
    {
      icon: Activity,
      title: "Monitor",
      description: "ClaimIt watches for price drops in the eligibility window",
    },
  ];

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-neutral-200 bg-neutral-50 p-6 md:flex-row md:gap-8">
      {steps.map((step, index) => (
        <div key={step.title} className="flex flex-1 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-0 border border-neutral-200">
            <step.icon className="h-5 w-5 text-neutral-500" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-neutral-900">{step.title}</p>
            <p className="text-sm text-neutral-700">{step.description}</p>
          </div>
          {index < steps.length - 1 ? (
            <ArrowRight className="hidden h-5 w-5 text-neutral-300 md:block shrink-0" aria-hidden />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: UploadQueueStatus }) {
  switch (status) {
    case "uploading":
      return (
        <Badge className="bg-brand-primary-50 text-brand-primary-600 border-0">Uploading...</Badge>
      );
    case "extracting":
      return (
        <Badge className="bg-neutral-50 text-neutral-700 border-0">
          <Loader2 className="mr-1 inline h-3 w-3 animate-spin" aria-hidden />
          Extracting...
        </Badge>
      );
    case "ready_to_review_high_confidence":
      return (
        <Badge className="bg-semantic-success-bg text-semantic-success border-0">
          Ready to review
        </Badge>
      );
    case "ready_to_review_low_confidence":
      return (
        <Badge className="bg-semantic-warning-bg text-semantic-warning border-0">
          Needs review
        </Badge>
      );
    case "extraction_failed":
      return <Badge className="bg-semantic-danger-bg text-semantic-danger border-0">Failed</Badge>;
    default:
      return null;
  }
}

function UploadItemCard({
  item,
  onRetry,
}: {
  item: UploadQueueItem;
  onRetry: (id: string) => void;
}) {
  const FileIcon = item.fileType === "pdf" ? FileText : ImageIcon;

  const statusMessage = (() => {
    switch (item.status) {
      case "uploading":
        return "Uploading receipt file.";
      case "extracting":
        return "Reading purchase details.";
      case "ready_to_review_high_confidence":
        return "Details extracted — review and confirm to start monitoring";
      case "ready_to_review_low_confidence":
        return "Some details unclear — please review carefully";
      case "extraction_failed":
        return "Extraction failed";
      default:
        return "";
    }
  })();

  return (
    <Card className="border-neutral-200 bg-neutral-0 py-4">
      <CardContent className="p-0 px-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3 sm:items-center min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-50 border border-neutral-200">
              <FileIcon className="h-5 w-5 text-neutral-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-neutral-900 truncate">{item.filename}</p>
              <p className="text-sm text-neutral-500">{item.sizeLabel}</p>
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex flex-col items-start gap-1 sm:items-end">
              <StatusBadge status={item.status} />
              <p className="text-sm text-neutral-700">{statusMessage}</p>
            </div>

            {item.status === "uploading" ? (
              <div className="w-full sm:w-32">
                <Progress
                  value={item.progress}
                  className="h-2 bg-brand-primary-500/20 [&>[data-slot=progress-indicator]]:bg-brand-primary-500"
                />
              </div>
            ) : null}

            {(item.status === "ready_to_review_high_confidence" ||
              item.status === "ready_to_review_low_confidence") &&
            item.purchaseId ? (
              <Link
                href={`/confirm/${item.purchaseId}`}
                className={cn(
                  buttonVariants({ size: "sm" }),
                  "bg-brand-primary-500 hover:bg-brand-primary-600 text-neutral-0 inline-flex shrink-0",
                )}
              >
                Review →
                <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
              </Link>
            ) : null}

            {item.status === "extraction_failed" ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => onRetry(item.id)}
                  className="border-neutral-300"
                >
                  <RotateCcw className="mr-1 h-4 w-4" aria-hidden />
                  Retry
                </Button>
                <Link
                  href={`/confirm/${item.purchaseId ?? item.id}`}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "border-neutral-300",
                  )}
                >
                  <Edit className="mr-1 h-4 w-4" aria-hidden />
                  Enter manually
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function UploadQueue({
  queue,
  onRetry,
  onClearCompleted,
}: {
  queue: UploadQueueItem[];
  onRetry: (id: string) => void;
  onClearCompleted: () => void;
}) {
  const hasCompleted = queue.some(
    (q) =>
      q.status === "ready_to_review_high_confidence" ||
      q.status === "ready_to_review_low_confidence" ||
      q.status === "extraction_failed",
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Upload queue</h2>
          <p className="text-sm text-neutral-700">
            Review each extracted purchase before monitoring starts.
          </p>
        </div>
        {hasCompleted ? (
          <Button
            variant="link"
            type="button"
            onClick={onClearCompleted}
            className="text-brand-primary-600 hover:text-brand-primary-700 shrink-0"
          >
            Clear completed
          </Button>
        ) : null}
      </div>

      <div className="space-y-3">
        {queue.map((item) => (
          <UploadItemCard key={item.id} item={item} onRetry={onRetry} />
        ))}
      </div>
    </div>
  );
}

function GmailConnectionCard() {
  return (
    <Card className="border-neutral-200 bg-neutral-50">
      <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-0 border border-neutral-200">
            <Mail className="h-5 w-5 text-neutral-500" />
          </div>
          <div>
            <CardTitle className="text-base text-neutral-900">Prefer auto-detection?</CardTitle>
            <CardDescription className="text-neutral-700">
              Connect Gmail to add supported order confirmations automatically.
            </CardDescription>
          </div>
        </div>
        <Link
          href="/settings/gmail"
          className={cn(
            buttonVariants({ variant: "outline" }),
            "border-neutral-300 shrink-0 justify-center text-center sm:text-left",
          )}
        >
          Connect Gmail
        </Link>
      </CardContent>
    </Card>
  );
}

function Dropzone({
  onFilesSelected,
  disabled,
}: {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}) {
  const [isDragOver, setIsDragOver] = React.useState(false);
  const inputId = React.useId();

  const acceptedMimeTypes = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

  const handleFiles = (files: FileList | null) => {
    if (!files) return;

    const fileArray = Array.from(files);
    const validFiles: File[] = [];
    const maxSize = mockUploadLimits.maxFileSizeMb * 1024 * 1024;

    if (fileArray.length > mockUploadLimits.maxFilesPerBatch) {
      toast.error(`Maximum ${mockUploadLimits.maxFilesPerBatch} files per batch`);
      return;
    }

    fileArray.forEach((file) => {
      if (!acceptedMimeTypes.includes(file.type)) {
        toast.error(`${file.name} format not supported`);
        return;
      }
      if (file.size > maxSize) {
        toast.error(`${file.name} exceeds ${mockUploadLimits.maxFileSizeMb}MB limit`);
        return;
      }
      validFiles.push(file);
    });

    if (validFiles.length > 0) {
      onFilesSelected(validFiles);
    }
  };

  return (
    <label
      htmlFor={inputId}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={cn(
        "flex h-[320px] w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-all md:h-[480px]",
        isDragOver
          ? "border-brand-primary-500 bg-brand-primary-50"
          : "border-neutral-300 bg-neutral-50 hover:border-neutral-400",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <input
        id={inputId}
        type="file"
        multiple
        accept=".pdf,.png,.jpg,.jpeg,.webp"
        className="sr-only"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
        aria-label="Upload receipt files"
      />
      <UploadCloud
        className={cn(
          "pointer-events-none mb-4 h-14 w-14 transition-colors",
          isDragOver ? "text-brand-primary-600" : "text-neutral-400",
        )}
        aria-hidden
      />
      <p className="pointer-events-none mb-2 px-4 text-center text-lg font-medium text-neutral-900">
        Drop receipts here or <span className="text-brand-primary-600">click to browse</span>
      </p>
      <p className="pointer-events-none px-4 text-center text-sm text-neutral-500">
        PDF, PNG, JPG, or WEBP up to {mockUploadLimits.maxFileSizeMb} MB · Up to{" "}
        {mockUploadLimits.maxFilesPerBatch} files at once
      </p>
    </label>
  );
}

function randomSimulatedPurchaseId(itemId: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    const short = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
    return `purchase_sim_${short}`;
  }
  return `purchase_sim_${itemId}`;
}

export function UploadPage() {
  const [queue, setQueue] = React.useState<UploadQueueItem[]>(initialUploadQueue);

  const handleFilesSelected = (files: File[]) => {
    const newItems: UploadQueueItem[] = files.map((file, index) => ({
      id: `u_new_${Date.now()}_${index}`,
      filename: file.name,
      size: file.size,
      sizeLabel: `${Math.round(file.size / 1024)} KB`,
      fileType: file.type === "application/pdf" ? "pdf" : "image",
      status: "uploading",
      purchaseId: null,
      progress: 0,
    }));

    setQueue((prev) => [...prev, ...newItems]);

    newItems.forEach((item) => {
      let progress = 0;
      const uploadInterval = window.setInterval(() => {
        progress += 20;
        setQueue((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, progress: Math.min(progress, 100) } : i)),
        );
        if (progress >= 100) {
          window.clearInterval(uploadInterval);
          setQueue((prev) =>
            prev.map((i) =>
              i.id === item.id ? { ...i, status: "extracting" as const, progress: 100 } : i,
            ),
          );

          window.setTimeout(() => {
            const rand = Math.random();
            let newStatus: UploadQueueStatus;
            if (rand < 0.6) {
              newStatus = "ready_to_review_high_confidence";
            } else if (rand < 0.9) {
              newStatus = "ready_to_review_low_confidence";
            } else {
              newStatus = "extraction_failed";
            }

            const purchaseId =
              newStatus === "extraction_failed" ? null : randomSimulatedPurchaseId(item.id);

            setQueue((prev) =>
              prev.map((i) =>
                i.id === item.id
                  ? {
                      ...i,
                      status: newStatus,
                      purchaseId,
                    }
                  : i,
              ),
            );
          }, 2000);
        }
      }, 200);
    });
  };

  const handleRetry = (id: string) => {
    setQueue((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: "extracting" as const, progress: 100 } : item,
      ),
    );

    window.setTimeout(() => {
      setQueue((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                status: "ready_to_review_high_confidence" as const,
                purchaseId: item.purchaseId ?? randomSimulatedPurchaseId(id),
              }
            : item,
        ),
      );
    }, 2000);
  };

  const handleClearCompleted = () => {
    setQueue((prev) =>
      prev.filter((item) => item.status === "uploading" || item.status === "extracting"),
    );
  };

  return (
    <div className="mx-auto w-full max-w-[960px] px-4 py-8 md:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Upload receipt</h1>
          <p className="mt-1 text-neutral-700">
            Add receipts manually. ClaimIt will extract purchase details, then ask you to review
            before monitoring starts.
          </p>
        </div>
        <Link
          href="/settings/gmail"
          className="shrink-0 text-sm text-brand-primary-600 hover:text-brand-primary-700"
        >
          Gmail settings
        </Link>
      </div>

      <div className="mb-8">
        <Dropzone onFilesSelected={handleFilesSelected} />
      </div>

      {queue.length === 0 ? (
        <div className="mb-8">
          <HelperExplainer />
        </div>
      ) : null}

      {queue.length > 0 ? (
        <div className="mb-8">
          <UploadQueue
            queue={queue}
            onRetry={handleRetry}
            onClearCompleted={handleClearCompleted}
          />
        </div>
      ) : null}

      {!mockUploadLimits.mockGmailConnected ? <GmailConnectionCard /> : null}
    </div>
  );
}
