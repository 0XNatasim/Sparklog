import React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Two-page tip shown before the first Field Service screenshot: how to take it, then an example.
// `onChoose(remember)` closes the tip and opens the picker; `remember` = never show it again.
export default function AutofillTipDialog({ t, open, page, onPage, onOpenChange, onChoose }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-0">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle>
            {page === 1
              ? t("form.autofillTip.title")
              : t("form.autofillTip.exampleTitle")}
          </DialogTitle>
          <p className="text-xs font-medium text-muted-foreground">
            {t("form.autofillTip.page", { current: page, total: 2 })}
          </p>
        </DialogHeader>

        {page === 1 ? (
          <>
            <div className="px-5 space-y-3 text-sm text-muted-foreground">
              <p><span className="font-semibold text-foreground">1.</span> {t("form.autofillTip.step1")}</p>
              <p><span className="font-semibold text-foreground">2.</span> {t("form.autofillTip.step2")}</p>
              <p><span className="font-semibold text-foreground">3.</span> {t("form.autofillTip.step3")}</p>
            </div>
            <DialogFooter className="px-5 pb-5 pt-3">
              <Button className="w-full" onClick={() => onPage(2)}>
                {t("form.autofillTip.next")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="px-5 pb-2">
              <div className="mb-3 text-sm text-muted-foreground">
                <p>{t("form.autofillTip.exampleDescription")}</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  <li>{t("form.autofillTip.exampleItem1")}</li>
                  <li>{t("form.autofillTip.exampleItem2")}</li>
                  <li>{t("form.autofillTip.exampleItem3")}</li>
                </ul>
              </div>
              <img
                src="/Auto-fill.webp"
                alt={t("form.autofillTip.exampleAlt")}
                className="mx-auto w-full rounded-md border object-contain"
                style={{ maxHeight: "60vh" }}
              />
            </div>
            <DialogFooter className="gap-2 px-5 pb-5 pt-2 sm:flex-col sm:space-x-0">
              <Button className="w-full" onClick={() => onChoose(false)}>
                {t("form.autofillTip.choose")}
              </Button>
              <Button variant="outline" className="w-full" onClick={() => onChoose(true)}>
                {t("form.autofillTip.dontShowAgain")}
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => onPage(1)}>
                {t("common.back")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
