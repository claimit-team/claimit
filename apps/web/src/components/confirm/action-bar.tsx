"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface ActionBarProps {
  purchaseId: string;
}

export function ActionBar({ purchaseId }: ActionBarProps) {
  const router = useRouter();

  // Interim routing — the B7 commit replaces both of these with
  // origin-aware exits + the real dismiss API. Default to /dashboard
  // because the global upload dialog (B2) replaced the standalone
  // /upload page that this used to bounce back to.
  const handleCancel = () => router.push("/dashboard");

  const handleIgnore = () => {
    toast.success("Receipt ignored in this mock flow.");
    router.push("/dashboard");
  };

  const handleConfirm = () => {
    toast.success("Purchase confirmed in this mock flow.");
    router.push(`/purchases/${purchaseId}`);
  };

  return (
    <div className="sticky bottom-0 z-30 border-t border-neutral-200 bg-neutral-0 px-4 py-4 lg:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-sm text-neutral-500">All your edits are local until you confirm</p>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:gap-3">
          <button
            type="button"
            onClick={handleCancel}
            className="text-sm text-neutral-500 hover:text-neutral-700 hover:underline text-left sm:text-center"
          >
            Cancel
          </button>

          <Dialog>
            <DialogTrigger
              render={<Button type="button" variant="outline" className="w-full sm:w-auto" />}
            >
              Ignore this
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Ignore this receipt?</DialogTitle>
                <DialogDescription>
                  We&apos;ll skip it and won&apos;t monitor for price changes. You can always upload
                  it again later.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button type="button" variant="outline" />}>
                  Go back
                </DialogClose>
                <Button
                  type="button"
                  className="bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600"
                  onClick={handleIgnore}
                >
                  Yes, ignore
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button
            type="button"
            onClick={handleConfirm}
            className="bg-brand-primary-500 hover:bg-brand-primary-600 text-neutral-0 w-full sm:w-auto"
          >
            Confirm and start monitoring
          </Button>
        </div>
      </div>
    </div>
  );
}
