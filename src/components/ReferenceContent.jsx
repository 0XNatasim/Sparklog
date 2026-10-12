import React, { useEffect, useMemo, useState } from "react";
import { ExternalLink, FileText, Mail, Phone } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { REFERENCE_BUCKET, blockFilePaths, parseRichText, phoneHref, safeUrl } from "@/lib/reference-blocks";
import { withTimeout } from "@/lib/utils";

const CALLOUT_STYLES = {
  info: "border-primary/30 bg-primary/10",
  warning: "border-amber-500/30 bg-amber-500/10",
  danger: "border-destructive/30 bg-destructive/10",
};

function Inline({ segments }) {
  return segments.map((segment, index) => (segment.bold ? <strong key={index}>{segment.text}</strong> : <React.Fragment key={index}>{segment.text}</React.Fragment>));
}

export function RichText({ text }) {
  return parseRichText(text).map((node, index) => {
    if (node.type === "list") {
      return (
        <ul key={index} className="list-disc space-y-1 pl-5">
          {node.items.map((item, itemIndex) => <li key={itemIndex}><Inline segments={item} /></li>)}
        </ul>
      );
    }
    return (
      <p key={index}>
        {node.lines.map((line, lineIndex) => (
          <React.Fragment key={lineIndex}>{lineIndex > 0 && <br />}<Inline segments={line} /></React.Fragment>
        ))}
      </p>
    );
  });
}

// Short-lived signed URLs for the private bucket, one request per rendered reference.
function useSignedUrls(blocks) {
  const paths = useMemo(() => [...new Set(blockFilePaths(blocks))], [blocks]);
  const key = paths.join("|");
  const [urls, setUrls] = useState({});
  useEffect(() => {
    if (paths.length === 0) return undefined;
    let cancelled = false;
    withTimeout(supabase.storage.from(REFERENCE_BUCKET).createSignedUrls(paths, 3600), 12000)
      .then(({ data }) => {
        if (cancelled) return;
        setUrls(Object.fromEntries((data || []).filter((row) => row.signedUrl).map((row) => [row.path, row.signedUrl])));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return urls;
}

const linkClass = "flex w-full items-center justify-between gap-3 rounded-lg border p-4 text-left font-medium transition-colors hover:border-primary/50 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export default function ReferenceContent({ blocks }) {
  const urls = useSignedUrls(blocks);
  const list = Array.isArray(blocks) ? blocks : [];
  return (
    <div className="space-y-4 text-sm leading-relaxed">
      {list.map((block, index) => {
        switch (block?.type) {
          case "heading":
            return <h3 key={index} className="pt-1 text-base font-semibold text-primary">{block.text}</h3>;
          case "text":
            return <div key={index} className="space-y-2"><RichText text={block.text} /></div>;
          case "callout":
            return <div key={index} className={`space-y-2 rounded-md border p-3 ${CALLOUT_STYLES[block.tone] || CALLOUT_STYLES.info}`}><RichText text={block.text} /></div>;
          case "link": {
            const href = safeUrl(block.url);
            if (!href) return null;
            return (
              <a key={index} href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
                <span>{block.label || href}</span>
                <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </a>
            );
          }
          case "file":
            return urls[block.path] ? (
              <a key={index} href={urls[block.path]} target="_blank" rel="noopener noreferrer" className={linkClass}>
                <span className="flex items-center gap-2"><FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />{block.label || block.path.split("/").pop()}</span>
                <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </a>
            ) : (
              <div key={index} className="flex items-center gap-2 rounded-lg border p-4 text-muted-foreground"><FileText className="h-4 w-4" aria-hidden="true" />{block.label || block.path.split("/").pop()}</div>
            );
          case "image":
            return (
              <figure key={index} className="space-y-1">
                {urls[block.path] ? (
                  <a href={urls[block.path]} target="_blank" rel="noopener noreferrer">
                    <img src={urls[block.path]} alt={block.caption || ""} loading="lazy" className="max-h-[70vh] w-full rounded-md border object-contain" />
                  </a>
                ) : (
                  <div className="h-24 rounded-md border bg-muted/50" />
                )}
                {block.caption && <figcaption className="text-xs text-muted-foreground">{block.caption}</figcaption>}
              </figure>
            );
          case "contact": {
            const tel = phoneHref(block.phone);
            const mail = block.email && !/\s/.test(block.email) ? `mailto:${block.email}` : null;
            return (
              <div key={index} className="rounded-md border p-3">
                {block.name && <div className="font-medium">{block.name}{block.role ? <span className="ml-2 text-xs font-normal text-muted-foreground">{block.role}</span> : null}</div>}
                {block.phone && (tel ? (
                  <a href={tel} className="mt-1 flex items-center gap-1.5 text-primary hover:underline"><Phone className="h-3.5 w-3.5" aria-hidden="true" />{block.phone}</a>
                ) : <div className="mt-1 flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" aria-hidden="true" />{block.phone}</div>)}
                {block.email && (mail ? (
                  <a href={mail} className="mt-1 flex items-center gap-1.5 text-primary hover:underline"><Mail className="h-3.5 w-3.5" aria-hidden="true" />{block.email}</a>
                ) : <div className="mt-1 flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" aria-hidden="true" />{block.email}</div>)}
                {block.note && <p className="mt-1 text-xs text-muted-foreground">{block.note}</p>}
              </div>
            );
          }
          default:
            return null;
        }
      })}
    </div>
  );
}
