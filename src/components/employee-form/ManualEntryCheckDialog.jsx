import React from "react";
import { Camera, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// A new field entry typed by hand: the screenshot is better, and Field Service must match the entry.
export default function ManualEntryCheckDialog({ t, open, onOpenChange, onUseScreenshot, onContinue }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-warning">
            <TriangleAlert className="h-5 w-5" />{t("form.manualEntryCheck.title")}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm">{t("form.manualEntryCheck.body")}</p>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onUseScreenshot}>
            <Camera className="mr-2 h-4 w-4" />{t("form.manualEntryCheck.useScreenshot")}
          </Button>
          <Button type="button" onClick={onContinue}>{t("form.manualEntryCheck.continue")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
