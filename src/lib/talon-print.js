// One print window for a whole week's talons, whatever their kind:
//   { kind: "kept", data }   — a talon kept in the ledger (comptabilisé from Calcul / Paie de la
//                              semaine, or imported), rendered in the employer's stub layout;
//   { kind: "stub", model, hdr, employee, frequency, official } — a talon computed live (aperçu).
// The two layouts share class names (.sheet, .cols, .sec…), so the kept layout's styles are
// scoped under .kept and every talon starts on its own page.
import { STUB_STYLES, stubSheetHtml } from "@/lib/paystub";
import { LEGACY_TALON_STYLES, legacyTalonSheet } from "@/lib/legacy-talon-render";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Prefix every selector of a flat stylesheet (rules and @media blocks; @page is left alone).
// html / body / * become the scope element itself.
export function scopeCss(css, scope) {
  return css.replace(/(^|[{}])(\s*)([^{}@]+?)(\s*)\{/g, (match, brace, lead, selectors, trail) => {
    const scoped = selectors.split(",").map((part) => {
      const sel = part.trim();
      if (!sel) return sel;
      if (/^(html|body|\*)$/.test(sel)) return scope;
      if (/^html,?\s*body$/.test(sel)) return scope;
      return `${scope} ${sel}`;
    }).join(", ");
    return `${brace}${lead}${scoped}${trail}{`;
  });
}

export function talonsDocument(items, title = "Talons de paie") {
  const pages = items.map((item) => (item.kind === "kept"
    ? `<div class="page kept">${legacyTalonSheet(item.data)}</div>`
    : `<div class="page">${stubSheetHtml(item)}</div>`));
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<style>${STUB_STYLES}
${scopeCss(LEGACY_TALON_STYLES.replace(/@page[^}]*}/g, ""), ".kept")}
.page + .page { break-before: page; page-break-before: always; }
.kept { padding: 0; }
</style></head>
<body>${pages.join("\n")}</body></html>`;
}

// Returns false when the popup was blocked.
export function openTalonsPrint(items, title) {
  const w = window.open("", "_blank", "width=860,height=1100");
  if (!w) return false;
  w.document.open();
  w.document.write(talonsDocument(items, title));
  w.document.close();
  let printed = false;
  const print = () => {
    if (printed) return;
    printed = true;
    try { w.focus(); w.print(); } catch { /* window closed */ }
  };
  w.onload = print;
  setTimeout(print, 500);
  return true;
}
