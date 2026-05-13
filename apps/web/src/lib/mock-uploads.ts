/** Demo upload queue wired to `/confirm/[purchaseId]` IDs (extended in Batch 6 confirm commit). */

export type UploadQueueStatus =
  | "uploading"
  | "extracting"
  | "ready_to_review_high_confidence"
  | "ready_to_review_low_confidence"
  | "extraction_failed";

export interface UploadQueueItem {
  id: string;
  filename: string;
  size: number;
  sizeLabel: string;
  fileType: "pdf" | "image";
  status: UploadQueueStatus;
  purchaseId: string | null;
  progress: number;
}

export const mockUploadLimits = {
  maxFilesPerBatch: 5,
  maxFileSizeMb: 10,
  acceptedFormats: ["PDF", "PNG", "JPG", "JPEG", "WEBP"] as const,
  mockGmailConnected: false,
};

/** Purchase IDs referenced by confirm mocks — see `mock-purchases.ts` pending rows. */
export const initialUploadQueue: UploadQueueItem[] = [
  {
    id: "u_001",
    filename: "best-buy-order.pdf",
    size: 245_000,
    sizeLabel: "245 KB",
    fileType: "pdf",
    status: "ready_to_review_high_confidence",
    purchaseId: "purchase_009",
    progress: 100,
  },
  {
    id: "u_002",
    filename: "hilton-confirmation.png",
    size: 180_000,
    sizeLabel: "180 KB",
    fileType: "image",
    status: "extracting",
    purchaseId: null,
    progress: 100,
  },
  {
    id: "u_003",
    filename: "blurry-receipt.jpg",
    size: 90_000,
    sizeLabel: "90 KB",
    fileType: "image",
    status: "ready_to_review_low_confidence",
    purchaseId: "purchase_010",
    progress: 100,
  },
];
