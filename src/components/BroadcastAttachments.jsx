import React, { useEffect, useState } from "react";
import dayjs from "dayjs";
import { FileText } from "lucide-react";
import { supabase } from "../supabaseClient";
import { useT } from "@/lib/use-t";
import { BROADCAST_BUCKET, broadcastAttachments } from "@/lib/broadcast-attachments";

// The pictures and PDFs of one broadcast (private bucket → signed links, valid 1 h).
// Pictures open full size in a new tab; PDFs open in the phone's / browser's PDF viewer.
export default function BroadcastAttachments({ broadcast, imageClassName = "max-h-72 w-full" }) {
  const t = useT();
  const attachments = broadcastAttachments(broadcast);
  const key = attachments.map((a) => a.path).join("|");
  const [urls, setUrls] = useState({});

  useEffect(() => {
    const paths = key ? key.split("|") : [];
    if (!paths.length) return undefined;
    let alive = true;
    supabase.storage.from(BROADCAST_BUCKET).createSignedUrls(paths, 3600).then(({ data }) => {
      if (!alive) return;
      const next = {};
      for (const row of data || []) if (row?.path && row.signedUrl) next[row.path] = row.signedUrl;
      setUrls(next);
    });
    return () => { alive = false; };
  }, [key]);

  if (!attachments.length) return null;
  return (
    <div className="space-y-2">
      {attachments.map((a, index) => {
        const url = urls[a.path];
        if (a.kind === "pdf") {
          return (
            <a
              key={a.path}
              href={url || undefined}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={!url}
              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium ${url ? "hover:bg-accent" : "pointer-events-none opacity-60"}`}
            >
              <FileText className="h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{a.name || t("broadcast.pdfFallbackName", { n: index + 1 })}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{t("broadcast.openPdf")}</span>
            </a>
          );
        }
        if (!url) return null;
        return (
          <a key={a.path} href={url} target="_blank" rel="noopener noreferrer" className="block">
            <img src={url} alt="" className={`${imageClassName} rounded-md border object-contain`} />
          </a>
        );
      })}
    </div>
  );
}

// « Modifié le … » on a message the manager corrected after sending it (migration 0107).
export function EditedTag({ at }) {
  const t = useT();
  return <span className="rounded-full bg-info/15 px-1.5 font-medium text-info">{t("broadcast.editedTag", { date: dayjs(at).format("DD MMM HH:mm") })}</span>;
}
