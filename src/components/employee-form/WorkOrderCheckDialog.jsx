import React from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Problems found on the Field Service screenshot (workOrderIssues), with the text read on demand so a
// misread can be reported exactly (kept in memory only, never saved).
export default function WorkOrderCheckDialog({ t, open, onOpenChange, problems, ocrText }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-warning">
            <TriangleAlert className="h-5 w-5" />{t("form.workOrderCheck.title")}
          </DialogTitle>
        </DialogHeader>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {problems.map((issue) => (
            <li key={issue.code}>{t(`form.workOrderCheck.${issue.code}`, { miles: String(issue.miles ?? "").replace(".", ","), km: issue.km ?? "" })}</li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">{t("form.workOrderCheck.body")}</p>
        {ocrText && (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none">{t("form.workOrderCheck.showText")}</summary>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded border border-border bg-muted/40 p-2 font-mono">{ocrText}</pre>
            <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => navigator.clipboard?.writeText(ocrText).catch(() => undefined)}>
              {t("form.workOrderCheck.copyText")}
            </Button>
          </details>
        )}
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>{t("common.ok")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
