import React, { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/lib/use-t";

// In-app replacement for window.confirm: `await confirm(message)` resolves to true/false.
export function useConfirmDialog() {
  const t = useT();
  const [request, setRequest] = useState(null);

  const confirm = useCallback((message) => new Promise((resolve) => setRequest({ message, resolve })), []);

  const answer = (value) => {
    request?.resolve(value);
    setRequest(null);
  };

  const dialog = (
    <Dialog open={Boolean(request)} onOpenChange={(open) => { if (!open) answer(false); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base leading-snug">{request?.message}</DialogTitle>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => answer(false)}>
            {t("common.no")}
          </Button>
          <Button type="button" onClick={() => answer(true)}>
            {t("common.yes")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return [confirm, dialog];
}
