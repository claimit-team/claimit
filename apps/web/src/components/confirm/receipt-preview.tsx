"use client";

import { ChevronLeft, ChevronRight, Download, FileText, ImageIcon, ZoomIn } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ReceiptPreviewProps {
  filename: string;
  receiptType: "pdf" | "image";
  receiptUrl: string;
}

export function ReceiptPreview({ filename, receiptType, receiptUrl }: ReceiptPreviewProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomOpen, setZoomOpen] = useState(false);
  const totalPages = 2;

  const isPdf = receiptType === "pdf";
  const FileIcon = isPdf ? FileText : ImageIcon;

  void receiptUrl;

  const previewBody =
    receiptType === "pdf" ? (
      <ScrollArea className="h-[400px] lg:h-[500px]">
        <div className="flex items-center justify-center bg-neutral-50 p-8">
          <div className="flex h-[350px] w-full max-w-[280px] flex-col items-center justify-center rounded border border-neutral-200 bg-neutral-0 shadow-sm">
            <FileText className="size-16 text-neutral-300" aria-hidden />
            <span className="mt-4 text-sm text-neutral-500">PDF Preview</span>
            <span className="text-xs text-neutral-400">{filename}</span>
          </div>
        </div>
      </ScrollArea>
    ) : (
      <button
        type="button"
        onClick={() => setZoomOpen(true)}
        className="group relative w-full cursor-zoom-in text-left"
      >
        <ScrollArea className="h-[400px] lg:h-[500px]">
          <div className="flex items-center justify-center bg-neutral-50 p-8">
            <div className="relative flex h-[350px] w-full max-w-[280px] flex-col items-center justify-center rounded border border-neutral-200 bg-neutral-0 shadow-sm">
              <ImageIcon className="size-16 text-neutral-300" aria-hidden />
              <span className="mt-4 text-sm text-neutral-500">Receipt Image</span>
              <span className="text-xs text-neutral-400">{filename}</span>
              <div className="absolute inset-0 flex items-center justify-center bg-neutral-950/0 transition-colors group-hover:bg-neutral-950/10">
                <div className="rounded-full bg-neutral-0/90 p-2 opacity-0 shadow transition-opacity group-hover:opacity-100">
                  <ZoomIn className="size-5 text-neutral-700" aria-hidden />
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>
      </button>
    );

  return (
    <div className="flex flex-col rounded-lg border border-neutral-200 bg-neutral-0">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <FileIcon className="size-4 shrink-0 text-neutral-500" aria-hidden />
          <span className="text-sm font-medium text-neutral-700 truncate max-w-[200px]">
            {filename}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          className="text-neutral-500 hover:text-neutral-700 shrink-0"
        >
          <Download className="mr-1 size-4" aria-hidden />
          Download
        </Button>
      </div>

      <div className="relative">{previewBody}</div>

      {isPdf && totalPages > 1 ? (
        <div className="flex items-center justify-center gap-2 border-t border-neutral-200 py-3">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            type="button"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="size-4" />
            <span className="sr-only">Previous page</span>
          </Button>
          <span className="text-sm text-neutral-500">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="ghost"
            size="icon"
            type="button"
            className="size-8"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
          >
            <ChevronRight className="size-4" />
            <span className="sr-only">Next page</span>
          </Button>
        </div>
      ) : null}

      <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
        <DialogContent className="max-w-3xl" showCloseButton>
          <DialogTitle className="sr-only">{filename}</DialogTitle>
          <div className="flex items-center justify-center p-4">
            <div className="flex h-[500px] w-full flex-col items-center justify-center rounded border border-neutral-200 bg-neutral-50">
              <ImageIcon className="size-24 text-neutral-300" aria-hidden />
              <span className="mt-4 text-lg text-neutral-500">Full size image</span>
              <span className="text-sm text-neutral-400">{filename}</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
