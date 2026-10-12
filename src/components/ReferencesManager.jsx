import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, BookOpen, Eye, EyeOff, FileText, Image as ImageIcon, Link2, Pencil, Plus, Trash2, Type, Heading, MessageSquareWarning, UserRound } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import ReferenceContent from "@/components/ReferenceContent";
import { friendlyErrorMessage } from "@/lib/error-messages";
import { prepareEvidenceImage } from "@/lib/evidence-file";
import { QUERY_BUDGETS } from "@/lib/query-budgets";
import {
  CALLOUT_TONES,
  MAX_BLOCKS,
  MAX_DESCRIPTION,
  MAX_TEXT,
  MAX_TITLE,
  REFERENCE_BUCKET,
  REFERENCE_FILE_MAX_BYTES,
  REFERENCE_SECTIONS,
  blockFilePaths,
  newBlock,
  referenceFilePath,
  sanitizeBlocks,
  validateReference,
} from "@/lib/reference-blocks";
import { moveItem, nextSortOrder } from "@/lib/sort-order";
import { useT } from "@/lib/use-t";
import { withTimeout } from "@/lib/utils";

const BLOCK_ICONS = { heading: Heading, text: Type, callout: MessageSquareWarning, link: Link2, file: FileText, image: ImageIcon, contact: UserRound };
const EMPTY_DRAFT = { id: null, section: "quick", title: "", description: "", published: true, blocks: [] };
const textareaClass = "min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const check = ({ error }) => { if (error) throw error; };

async function hasPdfHeader(file) {
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  return String.fromCharCode(...head) === "%PDF-";
}

// Configuration › Références: owners/managers write the content employees read in
// Profile › Références rapides / Contacts — text, links, PDFs, images and contact cards.
export default function ReferencesManager() {
  const t = useT();
  const [confirm, confirmDialog] = useConfirmDialog();
  const [references, setReferences] = useState([]);
  const [draft, setDraft] = useState(null); // null = list view
  const [showErrors, setShowErrors] = useState(false);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const busyRef = useRef(false);
  const originalPaths = useRef(new Set()); // files already stored for the reference being edited
  const sessionUploads = useRef(new Set()); // files uploaded during this edit, not yet saved

  const load = useCallback(async () => {
    try {
      const { data, error: loadError } = await withTimeout(
        supabase.from("profile_references")
          .select("id, section, title, description, blocks, published, sort_order, created_at")
          .order("section").order("sort_order").order("created_at")
          .limit(QUERY_BUDGETS.profileReferences),
        15000
      );
      if (loadError) throw loadError;
      setReferences(data || []);
    } catch (loadError) {
      setError(friendlyErrorMessage(loadError, t, "ref.errors.load"));
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  async function run(id, action, fallbackKey) {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(id);
    setError("");
    setInfo("");
    try {
      await action();
      return true;
    } catch (actionError) {
      setError(friendlyErrorMessage(actionError, t, fallbackKey));
      return false;
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  }

  const removeFiles = (paths) => {
    const unique = [...new Set(paths)].filter(Boolean);
    if (unique.length === 0) return Promise.resolve();
    // Best effort: an orphaned object is harmless, a failed save must not depend on it.
    return supabase.storage.from(REFERENCE_BUCKET).remove(unique).catch(() => undefined);
  };

  function startCreate(section = "quick") {
    originalPaths.current = new Set();
    sessionUploads.current = new Set();
    setDraft({ ...EMPTY_DRAFT, section });
    setShowErrors(false);
    setPreview(false);
    setInfo("");
  }

  function startEdit(reference) {
    originalPaths.current = new Set(blockFilePaths(reference.blocks));
    sessionUploads.current = new Set();
    setDraft({
      id: reference.id,
      section: reference.section,
      title: reference.title,
      description: reference.description || "",
      published: reference.published,
      blocks: Array.isArray(reference.blocks) ? reference.blocks.map((block) => ({ ...block })) : [],
    });
    setShowErrors(false);
    setPreview(false);
    setInfo("");
  }

  async function cancelEdit() {
    await removeFiles([...sessionUploads.current]);
    sessionUploads.current = new Set();
    setDraft(null);
    setError("");
  }

  async function save() {
    if (validateReference(draft).length) {
      setShowErrors(true);
      return;
    }
    const blocks = sanitizeBlocks(draft.blocks);
    const row = {
      section: draft.section,
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      published: draft.published,
      blocks,
    };
    const ok = await run("save", async () => {
      if (draft.id) {
        check(await withTimeout(supabase.from("profile_references").update(row).eq("id", draft.id), 15000));
      } else {
        const sameSection = references.filter((item) => item.section === draft.section);
        check(await withTimeout(supabase.from("profile_references").insert({ ...row, id: crypto.randomUUID(), sort_order: nextSortOrder(sameSection) }), 15000));
      }
    }, "ref.errors.save");
    if (!ok) return;
    const kept = new Set(blockFilePaths(blocks));
    // Files this reference no longer uses (replaced, or removed with their block).
    await removeFiles([...originalPaths.current, ...sessionUploads.current].filter((path) => !kept.has(path)));
    sessionUploads.current = new Set();
    setDraft(null);
    setInfo(t("ref.saved"));
    await load();
  }

  async function remove(reference) {
    if (!(await confirm(t("ref.deleteConfirm", { title: reference.title })))) return;
    const ok = await run(reference.id, async () => {
      check(await withTimeout(supabase.from("profile_references").delete().eq("id", reference.id), 12000));
    }, "ref.errors.delete");
    if (!ok) return;
    await removeFiles(blockFilePaths(reference.blocks));
    setInfo(t("ref.deleted"));
    await load();
  }

  async function togglePublished(reference) {
    const ok = await run(reference.id, async () => {
      check(await withTimeout(supabase.from("profile_references").update({ published: !reference.published }).eq("id", reference.id), 12000));
    }, "ref.errors.save");
    if (ok) setReferences((current) => current.map((item) => (item.id === reference.id ? { ...item, published: !reference.published } : item)));
  }

  async function move(section, index, delta) {
    const changes = moveItem(references.filter((item) => item.section === section), index, delta);
    if (!changes.length) return;
    const ok = await run("order", async () => {
      const results = await withTimeout(Promise.all(changes.map((change) => supabase.from("profile_references").update({ sort_order: change.sort_order }).eq("id", change.id))), 12000);
      results.forEach(check);
    }, "ref.errors.save");
    if (ok) await load();
  }

  // ── draft editing ──────────────────────────────────────────────────────────────
  const setDraftField = (key) => (event) => setDraft((current) => ({ ...current, [key]: event.target.value }));
  const patchBlock = (index, patch) => setDraft((current) => ({ ...current, blocks: current.blocks.map((block, i) => (i === index ? { ...block, ...patch } : block)) }));
  const addBlock = (type) => setDraft((current) => (current.blocks.length >= MAX_BLOCKS ? current : { ...current, blocks: [...current.blocks, newBlock(type)] }));
  const removeBlock = (index) => setDraft((current) => ({ ...current, blocks: current.blocks.filter((_, i) => i !== index) }));
  const moveBlock = (index, delta) => setDraft((current) => {
    const target = index + delta;
    if (target < 0 || target >= current.blocks.length) return current;
    const blocks = [...current.blocks];
    [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
    return { ...current, blocks };
  });

  async function pickFile(index, kind, event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    await run(`upload-${index}`, async () => {
      let body = file;
      let contentType = file.type;
      let uploadName = file.name;
      if (kind === "image") {
        // Re-encoded to JPEG: strips EXIF/GPS and keeps phone photos small.
        body = await prepareEvidenceImage(file, { maxEdge: 2000, quality: 0.85 });
        contentType = "image/jpeg";
        uploadName = `${file.name.replace(/\.[^.]+$/, "") || "image"}.jpg`;
      } else {
        if (file.type !== "application/pdf" || !(await hasPdfHeader(file))) throw new Error("reference_file_type_invalid");
        if (file.size > REFERENCE_FILE_MAX_BYTES) throw new Error("reference_file_too_large");
      }
      const path = referenceFilePath(uploadName);
      check(await withTimeout(supabase.storage.from(REFERENCE_BUCKET).upload(path, body, { contentType, upsert: false }), 90000));
      sessionUploads.current.add(path);
      const previous = draft.blocks[index]?.path;
      if (previous && sessionUploads.current.has(previous)) {
        sessionUploads.current.delete(previous);
        removeFiles([previous]);
      }
      setDraft((current) => ({
        ...current,
        blocks: current.blocks.map((block, i) => (i === index
          ? { ...block, path, ...(kind === "file" && !String(block.label || "").trim() ? { label: file.name } : {}) }
          : block)),
      }));
    }, "ref.errors.upload");
  }

  const errors = draft && showErrors ? validateReference(draft) : [];
  const err = (key) => errors.includes(key);

  // ── views ──────────────────────────────────────────────────────────────────────
  if (draft) {
    const previewBlocks = sanitizeBlocks(draft.blocks);
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        {confirmDialog}
        <Card>
          <CardHeader>
            <CardTitle>{draft.id ? t("ref.edit") : t("ref.new")}</CardTitle>
            <CardDescription>{t("ref.editorHint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive dark:text-red-300" role="alert">{error}</div>}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="ref-title">{t("ref.title")}</Label>
                <Input id="ref-title" value={draft.title} maxLength={MAX_TITLE} onChange={setDraftField("title")} className={err("title") ? "border-destructive" : ""} />
                {err("title") && <p className="text-xs text-destructive">{t("ref.errors.title")}</p>}
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="ref-description">{t("ref.description")}</Label>
                <Input id="ref-description" value={draft.description} maxLength={MAX_DESCRIPTION} onChange={setDraftField("description")} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ref-section">{t("ref.section")}</Label>
                <Select id="ref-section" value={draft.section} onChange={setDraftField("section")}>
                  {REFERENCE_SECTIONS.map((section) => <option key={section} value={section}>{t(`ref.section.${section}`)}</option>)}
                </Select>
              </div>
              <label className="flex cursor-pointer items-center gap-2 self-end pb-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={draft.published}
                  onChange={(event) => setDraft((current) => ({ ...current, published: event.target.checked }))} />
                {t("ref.published")}
              </label>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-semibold">{t("ref.content")}</p>
              {err("empty") && <p className="text-xs text-destructive">{t("ref.errors.empty")}</p>}
              {err("badUrl") && <p className="text-xs text-destructive">{t("ref.errors.badUrl")}</p>}
              {draft.blocks.map((block, index) => {
                const Icon = BLOCK_ICONS[block.type] || Type;
                const uploading = busy === `upload-${index}`;
                return (
                  <div key={index} className="space-y-3 rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-sm font-medium"><Icon className="h-4 w-4 text-primary" aria-hidden="true" />{t(`ref.block.${block.type}`)}</span>
                      <span className="flex items-center">
                        <Button type="button" variant="ghost" size="sm" className="h-8 px-2" disabled={index === 0} aria-label={t("common.moveUp")} onClick={() => moveBlock(index, -1)}><ArrowUp className="h-4 w-4" /></Button>
                        <Button type="button" variant="ghost" size="sm" className="h-8 px-2" disabled={index === draft.blocks.length - 1} aria-label={t("common.moveDown")} onClick={() => moveBlock(index, 1)}><ArrowDown className="h-4 w-4" /></Button>
                        <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-destructive" aria-label={t("common.delete")} onClick={() => removeBlock(index)}><Trash2 className="h-4 w-4" /></Button>
                      </span>
                    </div>
                    {block.type === "heading" && (
                      <Input value={block.text} maxLength={MAX_TITLE} placeholder={t("ref.headingPlaceholder")} onChange={(event) => patchBlock(index, { text: event.target.value })} />
                    )}
                    {(block.type === "text" || block.type === "callout") && (
                      <>
                        {block.type === "callout" && (
                          <Select value={block.tone} onChange={(event) => patchBlock(index, { tone: event.target.value })}>
                            {CALLOUT_TONES.map((tone) => <option key={tone} value={tone}>{t(`ref.tone.${tone}`)}</option>)}
                          </Select>
                        )}
                        <textarea className={textareaClass} value={block.text} maxLength={MAX_TEXT} onChange={(event) => patchBlock(index, { text: event.target.value })} />
                        <p className="text-xs text-muted-foreground">{t("ref.formatHint")}</p>
                      </>
                    )}
                    {block.type === "link" && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Input value={block.label} maxLength={MAX_TITLE} placeholder={t("ref.linkLabel")} onChange={(event) => patchBlock(index, { label: event.target.value })} />
                        <Input value={block.url} inputMode="url" placeholder="https://…" onChange={(event) => patchBlock(index, { url: event.target.value })} />
                      </div>
                    )}
                    {(block.type === "file" || block.type === "image") && (
                      <div className="space-y-2">
                        <Input value={block.type === "file" ? block.label : block.caption} maxLength={MAX_TITLE}
                          placeholder={t(block.type === "file" ? "ref.fileLabel" : "ref.imageCaption")}
                          onChange={(event) => patchBlock(index, block.type === "file" ? { label: event.target.value } : { caption: event.target.value })} />
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent">
                          <input type="file" className="hidden" disabled={uploading || Boolean(busy)}
                            accept={block.type === "file" ? "application/pdf" : "image/jpeg,image/png,image/webp"}
                            onChange={(event) => pickFile(index, block.type, event)} />
                          {uploading ? t("common.working") : block.path ? t("ref.replaceFile") : t(block.type === "file" ? "ref.chooseFile" : "ref.chooseImage")}
                        </label>
                        {block.path && <p className="break-all text-xs text-muted-foreground">{block.path.split("/").pop()}</p>}
                      </div>
                    )}
                    {block.type === "contact" && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Input value={block.name} maxLength={MAX_TITLE} placeholder={t("ref.contact.name")} onChange={(event) => patchBlock(index, { name: event.target.value })} />
                        <Input value={block.role} maxLength={MAX_TITLE} placeholder={t("ref.contact.role")} onChange={(event) => patchBlock(index, { role: event.target.value })} />
                        <Input value={block.phone} inputMode="tel" maxLength={40} placeholder={t("ref.contact.phone")} onChange={(event) => patchBlock(index, { phone: event.target.value })} />
                        <Input value={block.email} inputMode="email" maxLength={200} placeholder={t("ref.contact.email")} onChange={(event) => patchBlock(index, { email: event.target.value })} />
                        <Input className="sm:col-span-2" value={block.note} maxLength={MAX_DESCRIPTION} placeholder={t("ref.contact.note")} onChange={(event) => patchBlock(index, { note: event.target.value })} />
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="flex flex-wrap gap-2">
                {Object.keys(BLOCK_ICONS).map((type) => {
                  const Icon = BLOCK_ICONS[type];
                  return (
                    <Button key={type} type="button" variant="outline" size="sm" disabled={draft.blocks.length >= MAX_BLOCKS} onClick={() => addBlock(type)}>
                      <Icon className="mr-1 h-4 w-4" aria-hidden="true" />{t(`ref.block.${type}`)}
                    </Button>
                  );
                })}
              </div>
            </div>

            {preview && (
              <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("ref.preview")}</p>
                <p className="text-base font-semibold">{draft.title || "—"}</p>
                <ReferenceContent blocks={previewBlocks} />
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setPreview((value) => !value)}>{preview ? t("ref.hidePreview") : t("ref.showPreview")}</Button>
              <Button type="button" variant="outline" onClick={cancelEdit} disabled={busy === "save"}>{t("common.cancel")}</Button>
              <Button type="button" onClick={save} disabled={Boolean(busy)}>{busy === "save" ? t("common.saving") : t("common.save")}</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {confirmDialog}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <BookOpen className="h-5 w-5 shrink-0 text-primary" />
              <div>
                <CardTitle>{t("ref.pageTitle")}</CardTitle>
                <CardDescription className="mt-1">{t("ref.pageDescription")}</CardDescription>
              </div>
            </div>
            <Button type="button" size="sm" onClick={() => startCreate("quick")} disabled={Boolean(busy)}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" />{t("ref.add")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive dark:text-red-300" role="alert">{error}</div>}
          {info && <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary" role="status">{info}</div>}
          {REFERENCE_SECTIONS.map((section) => {
            const items = references.filter((item) => item.section === section);
            return (
              <section key={section} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t(`ref.section.${section}`)}</h2>
                  <Button type="button" variant="ghost" size="sm" onClick={() => startCreate(section)} disabled={Boolean(busy)}>
                    <Plus className="mr-1 h-4 w-4" aria-hidden="true" />{t("ref.add")}
                  </Button>
                </div>
                {items.length === 0 && <p className="text-sm text-muted-foreground">{t("ref.empty")}</p>}
                <ul className="divide-y rounded-lg border">
                  {items.map((reference, index) => (
                    <li key={reference.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <div className="min-w-0">
                        <div className="break-words text-sm font-medium">{reference.title}</div>
                        <div className="text-xs text-muted-foreground">{t("ref.blockCount", { count: Array.isArray(reference.blocks) ? reference.blocks.length : 0 })}</div>
                      </div>
                      <div className="flex items-center gap-1">
                        {!reference.published && <Badge variant="secondary" className="mr-1">{t("ref.hidden")}</Badge>}
                        <Button type="button" variant="ghost" size="sm" className="h-8 px-2" disabled={Boolean(busy) || index === 0} aria-label={t("common.moveUp")} onClick={() => move(section, index, -1)}><ArrowUp className="h-4 w-4" /></Button>
                        <Button type="button" variant="ghost" size="sm" className="h-8 px-2" disabled={Boolean(busy) || index === items.length - 1} aria-label={t("common.moveDown")} onClick={() => move(section, index, 1)}><ArrowDown className="h-4 w-4" /></Button>
                        <Button type="button" variant="ghost" size="sm" className="h-8 px-2" disabled={Boolean(busy)} aria-label={t(reference.published ? "ref.hide" : "ref.publish")} onClick={() => togglePublished(reference)}>
                          {reference.published ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="h-8 px-2" disabled={Boolean(busy)} aria-label={t("common.edit")} onClick={() => startEdit(reference)}><Pencil className="h-4 w-4" /></Button>
                        <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-destructive" disabled={Boolean(busy)} aria-label={t("common.delete")} onClick={() => remove(reference)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
