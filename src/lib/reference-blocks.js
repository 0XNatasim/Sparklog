// Profile references are an ordered list of content blocks edited in Configuration and
// shown to every employee. Keep the limits and the URL rule in step with
// validate_profile_reference() (migration 0079): the database re-checks them.
export const REFERENCE_SECTIONS = Object.freeze(["quick", "contacts"]);
export const BLOCK_TYPES = Object.freeze(["heading", "text", "callout", "link", "file", "image", "contact"]);
export const CALLOUT_TONES = Object.freeze(["info", "warning", "danger"]);
export const REFERENCE_BUCKET = "reference-files";
export const MAX_BLOCKS = 100;
export const MAX_TITLE = 200;
export const MAX_DESCRIPTION = 500;
export const MAX_TEXT = 8000;
export const REFERENCE_FILE_MAX_BYTES = 15 * 1024 * 1024;
export const REFERENCE_FILE_TYPES = Object.freeze(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

// Only these schemes may become an href: a stored `javascript:` or `data:` link must never
// reach an employee's browser. Returns the cleaned URL, or null when it is not allowed.
export function safeUrl(value) {
  const url = String(value ?? "").trim();
  if (!url || url.length > 2000 || /\s/.test(url)) return null;
  return /^(https?:\/\/|tel:|mailto:)\S+$/i.test(url) ? url : null;
}

export function phoneHref(phone) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `tel:+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `tel:+${digits}`;
  return digits ? `tel:${digits}` : null;
}

export function newBlock(type) {
  switch (type) {
    case "heading": return { type, text: "" };
    case "text": return { type, text: "" };
    case "callout": return { type, tone: "info", text: "" };
    case "link": return { type, label: "", url: "" };
    case "file": return { type, label: "", path: "" };
    case "image": return { type, path: "", caption: "" };
    case "contact": return { type, name: "", role: "", phone: "", email: "", note: "" };
    default: throw new Error(`unknown block type: ${type}`);
  }
}

const str = (value, max) => String(value ?? "").trim().slice(0, max);

// Keeps only known fields, trims them, and drops blocks that carry no content. The result is
// what gets stored, so the editor can never persist an unexpected shape.
export function sanitizeBlocks(blocks) {
  const out = [];
  for (const block of Array.isArray(blocks) ? blocks : []) {
    switch (block?.type) {
      case "heading": {
        const text = str(block.text, MAX_TITLE);
        if (text) out.push({ type: "heading", text });
        break;
      }
      case "text": {
        const text = String(block.text ?? "").trim().slice(0, MAX_TEXT);
        if (text) out.push({ type: "text", text });
        break;
      }
      case "callout": {
        const text = String(block.text ?? "").trim().slice(0, MAX_TEXT);
        if (text) out.push({ type: "callout", tone: CALLOUT_TONES.includes(block.tone) ? block.tone : "info", text });
        break;
      }
      case "link": {
        const url = safeUrl(block.url);
        if (url) out.push({ type: "link", label: str(block.label, MAX_TITLE) || url, url });
        break;
      }
      case "file": {
        const path = str(block.path, 300);
        if (path) out.push({ type: "file", label: str(block.label, MAX_TITLE) || str(block.name, MAX_TITLE) || path.split("/").pop(), path });
        break;
      }
      case "image": {
        const path = str(block.path, 300);
        if (path) out.push({ type: "image", path, caption: str(block.caption, MAX_TITLE) });
        break;
      }
      case "contact": {
        const contact = {
          type: "contact",
          name: str(block.name, MAX_TITLE),
          role: str(block.role, MAX_TITLE),
          phone: str(block.phone, 40),
          email: str(block.email, 200),
          note: str(block.note, MAX_DESCRIPTION),
        };
        if (contact.name || contact.phone || contact.email) out.push(contact);
        break;
      }
      default:
        break;
    }
  }
  return out;
}

// Error keys (reference.errors.*) for a reference about to be saved; empty when valid.
export function validateReference(values) {
  const errors = [];
  const title = String(values.title ?? "").trim();
  if (!title || title.length > MAX_TITLE) errors.push("title");
  if (String(values.description ?? "").length > MAX_DESCRIPTION) errors.push("description");
  if (!REFERENCE_SECTIONS.includes(values.section)) errors.push("section");
  const raw = Array.isArray(values.blocks) ? values.blocks : [];
  if (raw.length > MAX_BLOCKS) errors.push("tooManyBlocks");
  for (const block of raw) {
    if (block?.type === "link" && String(block.url ?? "").trim() && !safeUrl(block.url)) {
      errors.push("badUrl");
      break;
    }
  }
  if (sanitizeBlocks(raw).length === 0) errors.push("empty");
  return [...new Set(errors)];
}

export function validateReferenceFile(file) {
  if (!file) return "noFile";
  if (!REFERENCE_FILE_TYPES.includes(file.type)) return "fileType";
  if (file.size > REFERENCE_FILE_MAX_BYTES) return "fileSize";
  return null;
}

export function referenceFilePath(fileName, id = crypto.randomUUID()) {
  const clean = String(fileName || "file")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.+/, "")
    .slice(-80) || "file";
  return `${id}/${clean}`;
}

export function blockFilePaths(blocks) {
  return (Array.isArray(blocks) ? blocks : [])
    .filter((block) => (block?.type === "file" || block?.type === "image") && block.path)
    .map((block) => block.path);
}

// A reference made of one link and nothing else opens directly instead of a one-line popup.
export function directLink(reference) {
  const blocks = Array.isArray(reference?.blocks) ? reference.blocks : [];
  if (blocks.length !== 1 || blocks[0].type !== "link" || reference.description) return null;
  return safeUrl(blocks[0].url);
}

// **bold** inside one line → segments. No HTML is ever produced from user text.
export function parseInline(line) {
  return String(line ?? "")
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part) => (/^\*\*[^*]+\*\*$/.test(part) ? { bold: true, text: part.slice(2, -2) } : { bold: false, text: part }));
}

// Text blocks: blank line = new paragraph, "- " = bullet, **bold** inline.
export function parseRichText(text) {
  const nodes = [];
  let paragraph = null;
  let list = null;
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      paragraph = null;
      list = null;
    } else if (/^\s*[-•]\s+/.test(line)) {
      paragraph = null;
      if (!list) {
        list = { type: "list", items: [] };
        nodes.push(list);
      }
      list.items.push(parseInline(line.replace(/^\s*[-•]\s+/, "")));
    } else {
      list = null;
      if (!paragraph) {
        paragraph = { type: "paragraph", lines: [] };
        nodes.push(paragraph);
      }
      paragraph.lines.push(parseInline(line));
    }
  }
  return nodes;
}
