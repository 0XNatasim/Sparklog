import React from "react";
import { useOvertimeConfirmationForm } from "@/lib/overtime-form-link";
import { useT } from "@/lib/use-t";

// How to take the two proof captures: shared by the proof step (employee form) and the « proof sent back » notice.
// « Prenez 2 captures du <formulaire> AVANT de faire « Envoyer » » — the word « formulaire » opens the overtime confirmation form
// (its address comes from Profil › Formulaires, never from the code) in another window — then the two examples with what each must show.
export default function OvertimeProofHowTo() {
  const t = useT();
  const form = useOvertimeConfirmationForm();
  const [before, after] = t("form.evidence.howIntro").split("{form}");
  const word = t("form.evidence.formWord");
  const photos = [
    { n: 1, lines: ["form.evidence.photo1q2"] },
    { n: 2, lines: ["form.evidence.photo2q3"] },
  ];
  return (
    <div className="rounded-md border bg-muted/40 p-3 text-sm">
      <p className="font-semibold">
        {before}
        {form?.url ? (
          <a href={form.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 text-info">{word}</a>
        ) : word}
        {after}
      </p>
      <p className="mt-2 font-semibold text-destructive">{t("form.evidence.howSee")}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {photos.map(({ n, lines }) => (
          <figure key={n} className="space-y-1">
            <img src={`/overtime-example-${n}.webp`} alt={t(`form.evidence.exampleAlt${n}`)} className="w-full rounded border bg-background" />
            <figcaption className="text-xs">
              <div className="font-bold">{t(`form.evidence.photo${n}`)}</div>
              <ul className="list-disc space-y-0.5 pl-4">
                {lines.map((key) => <li key={key}>{t(key)}</li>)}
              </ul>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
