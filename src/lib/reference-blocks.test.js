import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  directLink, newBlock, parseInline, parseRichText, phoneHref, referenceFilePath, safeUrl, sanitizeBlocks,
  validateReference, validateReferenceFile,
} from "./reference-blocks";
import { buildFormRow, isHttpUrl, validateManagedForm } from "./managed-forms";
import { moveItem, nextSortOrder } from "./sort-order";

const migrationSql = readFileSync(fileURLToPath(new URL(
  "../../supabase/migrations/20261010120000_0079_managed_forms_and_references.sql", import.meta.url
)), "utf8");

describe("safeUrl", () => {
  it("allows only http(s), tel and mailto", () => {
    expect(safeUrl(" https://example.com/a?b=1 ")).toBe("https://example.com/a?b=1");
    expect(safeUrl("tel:+15145551234")).toBe("tel:+15145551234");
    expect(safeUrl("mailto:a@b.ca")).toBe("mailto:a@b.ca");
  });
  it.each(["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<script>", "//evil.com", "ftp://x.y", "https://a b.com", "", null, undefined])(
    "rejects %s", (value) => expect(safeUrl(value)).toBeNull()
  );
});

describe("rich text", () => {
  it("parses paragraphs, bullets and bold without producing HTML", () => {
    const nodes = parseRichText("**Titre :**\n- un\n- **deux** fois\n\nFin <b>x</b>");
    expect(nodes.map((n) => n.type)).toEqual(["paragraph", "list", "paragraph"]);
    expect(nodes[1].items[1]).toEqual([{ bold: true, text: "deux" }, { bold: false, text: " fois" }]);
    expect(nodes[2].lines[0][0].text).toBe("Fin <b>x</b>");
  });
  it("splits inline bold", () => {
    expect(parseInline("a **b** c")).toEqual([{ bold: false, text: "a " }, { bold: true, text: "b" }, { bold: false, text: " c" }]);
  });
});

describe("sanitizeBlocks / validateReference", () => {
  it("drops empty blocks, unknown types and unsafe links, and trims fields", () => {
    const blocks = sanitizeBlocks([
      { type: "heading", text: "  Titre " }, { type: "text", text: "   " }, { type: "script", text: "x" },
      { type: "link", label: "", url: "javascript:alert(1)" }, { type: "link", label: "", url: "https://a.ca" },
      { type: "contact", name: "", phone: "", email: "" }, { type: "contact", name: "Ann", phone: "514-555-1234", evil: 1 },
      { type: "callout", tone: "bogus", text: "ok" },
    ]);
    expect(blocks).toEqual([
      { type: "heading", text: "Titre" },
      { type: "link", label: "https://a.ca", url: "https://a.ca" },
      { type: "contact", name: "Ann", role: "", phone: "514-555-1234", email: "", note: "" },
      { type: "callout", tone: "info", text: "ok" },
    ]);
  });
  it("requires a title, a section and some content, and rejects unsafe links", () => {
    const ok = { title: "T", section: "quick", description: "", blocks: [{ type: "text", text: "x" }] };
    expect(validateReference(ok)).toEqual([]);
    expect(validateReference({ ...ok, title: " " })).toContain("title");
    expect(validateReference({ ...ok, section: "x" })).toContain("section");
    expect(validateReference({ ...ok, blocks: [] })).toContain("empty");
    expect(validateReference({ ...ok, blocks: [{ type: "link", url: "javascript:1" }] })).toEqual(expect.arrayContaining(["badUrl", "empty"]));
  });
  it("creates every block type", () => {
    for (const type of ["heading", "text", "callout", "link", "file", "image", "contact"]) expect(newBlock(type).type).toBe(type);
    expect(() => newBlock("x")).toThrow();
  });
});

describe("helpers", () => {
  it("formats phone links", () => {
    expect(phoneHref("438-289-4456")).toBe("tel:+14382894456");
    expect(phoneHref("1 438 289 4456")).toBe("tel:+14382894456");
    expect(phoneHref("")).toBeNull();
  });
  it("opens a single-link reference directly", () => {
    expect(directLink({ blocks: [{ type: "link", url: "https://a.ca" }] })).toBe("https://a.ca");
    expect(directLink({ description: "d", blocks: [{ type: "link", url: "https://a.ca" }] })).toBeNull();
    expect(directLink({ blocks: [{ type: "text", text: "x" }] })).toBeNull();
  });
  it("builds a safe storage path and validates upload type/size", () => {
    expect(referenceFilePath("Fiche Électrique (v2).pdf", "id1")).toBe("id1/Fiche_Electrique_v2_.pdf");
    expect(referenceFilePath("../../x", "id1")).not.toContain("..");
    expect(validateReferenceFile({ type: "application/pdf", size: 10 })).toBeNull();
    expect(validateReferenceFile({ type: "text/html", size: 10 })).toBe("fileType");
    expect(validateReferenceFile({ type: "application/pdf", size: 16 * 1024 * 1024 })).toBe("fileSize");
  });
});

describe("managed forms", () => {
  it("needs a name and an http(s) link", () => {
    expect(validateManagedForm({ name_fr: "Absence", url: "https://forms.office.com/x" })).toEqual([]);
    expect(validateManagedForm({ name_en: "Absence", url: "http://x.ca" })).toEqual([]);
    expect(validateManagedForm({ name_fr: " ", name_en: "", url: "https://x.ca" })).toEqual(["name"]);
    expect(validateManagedForm({ name_fr: "A", url: "javascript:1" })).toEqual(["url"]);
    expect(isHttpUrl("mailto:a@b.ca")).toBe(false);
  });
  it("normalizes the row to write", () => {
    expect(buildFormRow({ name_fr: " A ", name_en: "", url: " https://x.ca ", employee_specific: 1 }))
      .toEqual({ name_fr: "A", name_en: null, url: "https://x.ca", employee_specific: true });
  });
});

describe("sort order", () => {
  const rows = [{ id: "a", sort_order: 0 }, { id: "b", sort_order: 0 }, { id: "c", sort_order: 0 }];
  it("moves an item even when every row starts tied", () => {
    expect(moveItem(rows, 2, -1)).toEqual([{ id: "a", sort_order: 10 }, { id: "c", sort_order: 20 }, { id: "b", sort_order: 30 }]);
    // Already numbered: only the two swapped rows are written.
    expect(moveItem([{ id: "a", sort_order: 10 }, { id: "b", sort_order: 20 }, { id: "c", sort_order: 30 }], 1, 1))
      .toEqual([{ id: "c", sort_order: 20 }, { id: "b", sort_order: 30 }]);
  });
  it("ignores out-of-range moves and appends at the end", () => {
    expect(moveItem(rows, 0, -1)).toEqual([]);
    expect(moveItem(rows, 2, 1)).toEqual([]);
    expect(nextSortOrder([{ sort_order: 30 }, { sort_order: 10 }])).toBe(40);
    expect(nextSortOrder([])).toBe(10);
  });
});

describe("migration 0079 database contract", () => {
  it("lets only manager-tier roles write forms, references and files", () => {
    for (const policy of ["employee_forms: manager insert", "employee_forms: manager delete", "profile references: manager insert",
      "profile references: manager update", "profile references: manager delete", "reference files: manager upload", "reference files: manager delete"]) {
      expect(migrationSql).toContain(`"${policy}"`);
    }
    expect(migrationSql).toContain("using (published or (select public.get_my_role()) = 'manager')");
    expect(migrationSql).toContain("alter table public.profile_references enable row level security");
  });
  it("validates block shape and URL schemes in the database", () => {
    expect(migrationSql).toContain("reference_url_invalid");
    expect(migrationSql).toContain("'^(https?://|tel:|mailto:)[^[:space:]]+$'");
    expect(migrationSql).toContain("reference_file_path_invalid");
    expect(migrationSql).toMatch(/create trigger profile_references_validate before insert or update/);
    const fn = migrationSql.slice(migrationSql.indexOf("function public.validate_profile_reference"), migrationSql.indexOf("revoke all on function public.validate_profile_reference"));
    expect(fn).not.toContain("security definer");
  });
  it("keeps a private, typed, size-limited bucket", () => {
    expect(migrationSql).toContain("'reference-files', 'reference-files', false, 15728640");
    expect(migrationSql).toContain("array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']");
  });
  it("seeds the 8 existing forms without touching their enabled flag, and the existing references", () => {
    expect(migrationSql.match(/^  \('[a-z-]+', false, '/gm)).toHaveLength(8);
    expect(migrationSql).not.toMatch(/set\s+[^;]*enabled\s*=/);
    expect(migrationSql).toContain("where not exists (select 1 from public.profile_references)");
    for (const title of ["Status de réservation", "Calypso V1", "Distance entre thermostats", "Température d'entreposage", "Britton", "Support installation"]) {
      expect(migrationSql.replace(/''/g, "'")).toContain(title);
    }
  });
});
