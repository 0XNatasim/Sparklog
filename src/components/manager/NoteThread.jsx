import React, { useState } from "react";
import dayjs from "dayjs";
import { MessageCircle, SendHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_REPLY, cleanReplyBody, visibleReplies } from "@/lib/notes";
import { useT } from "@/lib/use-t";
import { cn } from "@/lib/utils";

const replyTime = (value) => {
  const d = dayjs(value);
  return d.isSame(dayjs(), "day") ? d.format("HH:mm") : d.format("D MMM · HH:mm");
};

// On a computer Enter sends (Shift+Enter: new line); on a phone the Enter key stays a new line.
const enterSends = () => typeof window !== "undefined" && !window.matchMedia?.("(pointer: coarse)")?.matches;

// The conversation under a shared note (0118), like a chat: my replies on the right in the action colour,
// the others' on the left in blue with their name. Replies written since I last saw the note are « new ».
export default function NoteThread({ note, replies, me, nameOf, newIds, onSend, onDelete, busy }) {
  const t = useT();
  const [text, setText] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState("");
  const { shown, hidden } = visibleReplies(replies, expanded);
  const canReply = note.shared;
  if (!canReply && !replies?.length) return null;

  async function send(event) {
    event?.preventDefault();
    const body = cleanReplyBody(text);
    if (!body) { setError(t("notes.replies.empty")); return; }
    setError("");
    if (await onSend(body)) setText("");
  }

  return (
    <section aria-label={t("notes.replies.title")} className="space-y-2 rounded-lg bg-muted/40 p-2.5">
      {hidden > 0 && (
        <button type="button" className="mx-auto block text-xs font-semibold text-info hover:underline" onClick={() => setExpanded(true)}>
          {t("notes.replies.earlier", { count: hidden })}
        </button>
      )}
      {shown.length > 0 && (
        <ol className="space-y-1.5">
          {shown.map((reply) => {
            const mine = reply.user_id === me;
            const fresh = newIds?.has(reply.id);
            return (
              <li key={reply.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "group relative max-w-[85%] rounded-2xl px-3 py-1.5 text-sm shadow-sm",
                    mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border border-info/30 bg-info/15 text-foreground",
                    fresh && "ring-2 ring-destructive/60",
                  )}
                >
                  {!mine && <div className="text-xs font-semibold text-info">{nameOf(reply.user_id)}</div>}
                  <p className="whitespace-pre-wrap break-words leading-snug">{reply.body}</p>
                  <div className={cn("mt-0.5 flex items-center justify-end gap-1.5 text-xs", mine ? "text-primary-foreground/80" : "text-muted-foreground")}>
                    {fresh && <span className="font-semibold text-destructive">{t("notes.replies.new")}</span>}
                    <time dateTime={reply.created_at}>{replyTime(reply.created_at)}</time>
                    {mine && (
                      <button
                        type="button"
                        className="-mr-1 rounded p-0.5 opacity-70 hover:opacity-100 focus-visible:opacity-100"
                        aria-label={t("notes.replies.delete")}
                        title={t("notes.replies.delete")}
                        disabled={busy}
                        onClick={() => onDelete(reply)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {canReply && (
        <form onSubmit={send} className="flex min-w-0 items-end gap-2">
          <MessageCircle className="mb-2.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <textarea
            rows={1}
            value={text}
            maxLength={MAX_REPLY}
            placeholder={t("notes.replies.placeholder")}
            aria-label={t("notes.replies.placeholder")}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && enterSends()) send(e);
            }}
            className="max-h-32 min-h-10 w-0 min-w-0 flex-1 resize-y rounded-2xl border border-input bg-background px-3 py-2 text-base leading-snug focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
          />
          <Button type="submit" size="icon" className="h-10 w-10 shrink-0 rounded-full" disabled={busy || !text.trim()} aria-label={t("notes.replies.send")} title={t("notes.replies.send")}>
            <SendHorizontal className="h-4 w-4" />
          </Button>
        </form>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </section>
  );
}
