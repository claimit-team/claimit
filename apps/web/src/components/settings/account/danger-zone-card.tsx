"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type DangerZoneCardProps = {
  onDeleteAccount: () => void;
};

export function DangerZoneCard({ onDeleteAccount }: DangerZoneCardProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const handleDeleteAccount = () => {
    setShowDialog(false);
    setConfirmText("");
    onDeleteAccount();
  };

  const isConfirmValid = confirmText === "DELETE";

  return (
    <>
      <Card className="border-semantic-danger/30 bg-neutral-0">
        <CardHeader>
          <CardTitle className="text-neutral-900">Danger zone</CardTitle>
          <CardDescription className="text-neutral-700">
            This action is permanent in a real product. For this MVP screen, it only opens a
            confirmation dialog.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="destructive"
            onClick={() => setShowDialog(true)}
            className="bg-semantic-danger hover:bg-semantic-danger/90"
          >
            Delete account
          </Button>
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="border-neutral-200 bg-neutral-0">
          <DialogHeader>
            <DialogTitle className="text-neutral-900">Delete account?</DialogTitle>
            <DialogDescription className="text-neutral-700">
              This would remove your account, purchases, claims, conversations, and settings in a
              real product. This mock screen will not delete data.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label htmlFor="confirm-delete" className="text-neutral-900">
              Type DELETE to confirm
            </Label>
            <Input
              id="confirm-delete"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type DELETE"
              className="border-neutral-200"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowDialog(false);
                setConfirmText("");
              }}
              className="border-neutral-200"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={!isConfirmValid}
              className="bg-semantic-danger hover:bg-semantic-danger/90"
            >
              Delete account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
