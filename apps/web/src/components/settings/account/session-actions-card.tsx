"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type SessionActionsCardProps = {
  onSignOut: () => void;
};

export function SessionActionsCard({ onSignOut }: SessionActionsCardProps) {
  const [showDialog, setShowDialog] = useState(false);

  const handleSignOut = () => {
    setShowDialog(false);
    onSignOut();
  };

  return (
    <>
      <Card className="border-neutral-200 bg-neutral-0">
        <CardHeader>
          <CardTitle className="text-neutral-900">Session</CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowDialog(true)}
            className="border-semantic-danger text-semantic-danger hover:bg-semantic-danger/10"
          >
            Sign out
          </Button>
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="border-neutral-200 bg-neutral-0">
          <DialogHeader>
            <DialogTitle className="text-neutral-900">Sign out?</DialogTitle>
            <DialogDescription className="text-neutral-700">
              You will need to sign in again to access your dashboard.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowDialog(false)}
              className="border-neutral-200"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleSignOut}
              className="bg-semantic-danger hover:bg-semantic-danger/90"
            >
              Sign out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
