import React, { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_NOTE_FILES, NOTE_FILE_ACCEPT, addPickedNoteImages } from "@/lib/note-files";
import { useT } from "@/lib/use-t";

// Pictures chosen for a note that is not saved yet (a new note, or the foreman's note held on the work sheet): previews with a
// « remove » button. They are sent when the note is saved. `existing` = pictures the note already has.
export default function StagedNoteImages({ files, onChange, existing = 0, disabled = false }) {
  const t = useT();
  const input = useRef(null);
  const [skipped, setSkipped] = useState(0);
  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  function picked(event) {
    const chosen = [...(event.target.files || [])];
    event.target.value = "";
    const next = addPickedNoteImages(files, chosen, existing);
    setSkipped(next.skipped);
    onChange(next.files);
  }

  return (
    <div className="space-y-2">
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={t("noteFiles.chosen", { count: files.length })}>
          {files.map((file, index) => (
            <li key={`${file.name}-${file.size}-${index}`} className="relative">
              <img src={previews[index]} alt={t("noteFiles.alt", { n: index + 1 })} className="h-24 w-24 rounded-md border object-cover" />
              <button type="button" disabled={disabled} onClick={() => onChange(files.filter((_, i) => i !== index))} aria-label={`${t("noteFiles.remove")} ${index + 1}`}
                className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full border bg-background text-destructive shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {existing + files.length < MAX_NOTE_FILES && (
        <>
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => input.current?.click()}>
            <ImagePlus className="mr-1.5 h-4 w-4" />{t("noteFiles.add")}
          </Button>
          <input ref={input} type="file" accept={NOTE_FILE_ACCEPT} multiple className="hidden" aria-label={t("noteFiles.add")} onChange={picked} />
        </>
      )}
      {skipped > 0 && <p className="text-sm text-destructive" role="alert">{t("noteFiles.skipped", { count: skipped })}</p>}
    </div>
  );
}
