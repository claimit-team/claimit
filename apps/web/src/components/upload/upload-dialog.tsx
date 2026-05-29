"use client";

import { FileText, ImageIcon, UploadCloud, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { type FileRejection, useDropzone } from "react-dropzone";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { PurchasesApiError, uploadPurchase } from "@/lib/api/purchases";
import { stashUploadDraft } from "@/lib/confirm-staging";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store";

/**
 * Receipt upload dialog (ticket 5.14 B2 — replaces the mock /upload
 * queue page).
 *
 * Mounted once at the authenticated layout level. Any control on any
 * page that wants to surface the upload flow toggles
 * `useUIStore(s => s.setUploadDialogOpen)(true)` — same pattern as
 * how the floating-assistant proactive panel is driven.
 *
 * Flow:
 *   - react-dropzone enforces accept (PDF/PNG/JPEG) + maxSize (10 MB)
 *     up-front; rejections surface as toast errors and never reach
 *     `uploadPurchase`.
 *   - On submit the dialog calls `uploadPurchase(file)` (multipart
 *     POST → api-gateway). Indeterminate progress is rendered because
 *     `fetch` cannot expose XHR-style upload progress events; the
 *     `Progress` bar oscillates to indicate liveness rather than
 *     misleading the user with a real-percent number we can't supply.
 *   - On success → `router.push(/confirm/:id)` and the dialog closes.
 *     The confirm page handles the async-extraction poll itself
 *     (B3); we don't poll here.
 *   - Errors land as toasts: 413 → file too big, 415 → wrong type
 *     (defense-in-depth against a non-react-dropzone caller — the
 *     dropzone normally catches the same cases up-front), anything
 *     else → generic.
 *
 * Hard size + type constants mirror the backend
 * (MAX_UPLOAD_BYTES = 10 MB, `_ALLOWED_UPLOAD_CONTENT_TYPES` =
 * PDF/PNG/JPEG) so the dropzone matches what the server actually
 * accepts and we never round-trip a doomed upload.
 */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ACCEPT_MAP: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
};
const ACCEPT_LABEL = "PDF, PNG, or JPG up to 10 MB.";

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function UploadDialog() {
  const open = useUIStore((s) => s.uploadDialogOpen);
  const setOpen = useUIStore((s) => s.setUploadDialogOpen);
  const router = useRouter();

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Revoke the previous object URL whenever the file changes / the
  // dialog closes, so we don't leak preview blobs across attempts.
  useEffect(() => {
    if (!file?.type.startsWith("image/")) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Reset transient state every time the dialog opens so a previous
  // failed attempt doesn't pre-populate the UI.
  useEffect(() => {
    if (!open) {
      setFile(null);
      setUploading(false);
    }
  }, [open]);

  const onDrop = useCallback((accepted: File[], rejections: FileRejection[]) => {
    if (rejections.length > 0) {
      const first = rejections[0];
      const code = first.errors[0]?.code;
      if (code === "file-too-large") {
        toast.error("That file is too large. PDF, PNG, or JPG up to 10 MB.");
      } else if (code === "file-invalid-type") {
        toast.error("Unsupported file type. We accept PDF, PNG, or JPG.");
      } else {
        toast.error("We couldn't accept that file. Try a different one.");
      }
      return;
    }
    const next = accepted[0];
    if (next) setFile(next);
  }, []);

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    open: openPicker,
  } = useDropzone({
    onDrop,
    accept: ACCEPT_MAP,
    maxSize: MAX_UPLOAD_BYTES,
    multiple: false,
    // Surface the dropzone's own button so we render a tasteful
    // shadcn-flavoured CTA instead of the library's default.
    noClick: false,
    noKeyboard: false,
  });

  const handleSubmit = useCallback(async () => {
    if (!file || uploading) return;
    setUploading(true);
    try {
      const draft = await uploadPurchase(file);
      toast.success("Receipt uploaded.");
      // Write-after-confirm: nothing is persisted yet. Stash the
      // extracted fields client-side and route to /confirm/<stagingKey>;
      // the Purchase is created only when the user confirms there.
      const stagingKey = stashUploadDraft(draft);
      // Close before navigating so the dialog doesn't briefly flash
      // back over the confirm page during route transition.
      setOpen(false);
      // Carry `?from=/dashboard` so the confirm-page Back affordance
      // lands the user back on the dashboard (the upload dialog can
      // be opened from any page but the "I uploaded then changed my
      // mind" return surface is the dashboard hero). Cancel inside
      // the confirm page is unchanged — also lands on /dashboard.
      router.push(`/confirm/${stagingKey}?from=/dashboard`);
    } catch (err) {
      let message = "We couldn't upload that receipt. Try again.";
      if (err instanceof PurchasesApiError) {
        if (err.code === "file_too_large") {
          message = "That file is too large. PDF, PNG, or JPG up to 10 MB.";
        } else if (err.code === "unsupported_media_type") {
          message = "Unsupported file type. We accept PDF, PNG, or JPG.";
        } else if (err.code === "unauthenticated") {
          message = "Sign in to upload a receipt.";
        } else {
          message = err.message;
        }
      }
      toast.error(message);
      setUploading(false);
    }
  }, [file, uploading, router, setOpen]);

  const isPdf = file?.type === "application/pdf";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // An in-flight upload (GCS write + synchronous extraction) should
        // not be cancellable mid-request — closing the dialog would drop
        // the response the confirm page needs. Nothing is persisted to
        // MongoDB until the user confirms, so there's no sentinel to strand.
        if (uploading && !next) return;
        setOpen(next);
      }}
    >
      <DialogContent className="sm:max-w-lg" showCloseButton={!uploading}>
        <DialogHeader>
          <DialogTitle>Upload a receipt</DialogTitle>
          <DialogDescription>
            ClaimIt extracts the purchase details and starts monitoring the eligible window.{" "}
            {ACCEPT_LABEL}
          </DialogDescription>
        </DialogHeader>

        {file ? (
          <div className="flex items-start gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
            {isPdf || !previewUrl ? (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-neutral-0 border border-neutral-200">
                {isPdf ? (
                  <FileText className="size-7 text-neutral-500" aria-hidden />
                ) : (
                  <ImageIcon className="size-7 text-neutral-500" aria-hidden />
                )}
              </div>
            ) : (
              // biome-ignore lint/performance/noImgElement: Object-URL preview, not a remote asset; next/image would force a remote loader.
              <img
                src={previewUrl}
                alt={`Preview of ${file.name}`}
                className="h-16 w-16 shrink-0 rounded-md border border-neutral-200 object-cover"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-neutral-900">{file.name}</p>
              <p className="text-xs text-neutral-500">{formatBytes(file.size)}</p>
              {uploading ? (
                <div className="mt-2 space-y-1">
                  {/* Indeterminate progress: `fetch` cannot expose upload
                      progress. Base-ui's Progress renders an indeterminate
                      shimmer when `value` is null; we use that so the bar
                      indicates liveness rather than misleading the user
                      with a fake percentage we can't actually compute. */}
                  <Progress value={null} className="h-1.5" />
                  <p className="text-xs text-neutral-500">Uploading…</p>
                </div>
              ) : null}
            </div>
            {!uploading ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8 shrink-0 text-neutral-500"
                onClick={() => setFile(null)}
                aria-label="Remove selected file"
              >
                <X className="size-4" aria-hidden />
              </Button>
            ) : null}
          </div>
        ) : (
          <div
            {...getRootProps({
              className: cn(
                "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 text-center transition-colors cursor-pointer",
                isDragActive
                  ? "border-brand-primary-400 bg-brand-primary-50"
                  : "border-neutral-300 hover:border-neutral-400",
              ),
            })}
          >
            <input {...getInputProps()} />
            <UploadCloud className="size-10 text-neutral-400" aria-hidden />
            <div>
              <p className="text-sm font-medium text-neutral-900">
                {isDragActive ? "Drop your receipt here" : "Drag a receipt here"}
              </p>
              <p className="mt-1 text-xs text-neutral-500">{ACCEPT_LABEL}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={(event) => {
                // Avoid double-open: the dropzone root already wires
                // a click-to-open; stop the bubble before it triggers
                // the picker twice.
                event.stopPropagation();
                openPicker();
              }}
            >
              Browse files
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={uploading}
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!file || uploading}
            className="bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600"
          >
            {uploading ? "Uploading…" : "Upload receipt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
