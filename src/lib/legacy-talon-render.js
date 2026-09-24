// Render an IMPORTED legacy talon exactly in the old layout (header + Transactions +
// Sommaire Période/Cumulatif), from the parsed record (see talon-import-core). Used for the
// import preview and for reprinting a past talon. Standalone HTML (no Tailwind).
import { EMPLOYER } from "@/lib/paystub";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (v) => (v == null || v === "" ? "" : `$${Number(v).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const num2 = (v) => (v == null || v === "" ? "" : Number(v).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const num4 = (v) => (v == null || v === "" ? "" : Number(v).toFixed(4));
const isHours = (row) => row.key === "hoursYtd" || /heures/i.test(row.description || "");

export const LEGACY_TALON_STYLES = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #111; background: #fff; padding: 16px; font-size: 11px; line-height: 1.4; }
  .sheet { max-width: 780px; margin: 0 auto 18px; }
  .hd { display: grid; grid-template-columns: 1fr 1fr; gap: 1px 24px; margin-bottom: 8px; }
  .hd .f { display: flex; gap: 6px; }
  .hd .k { color: #111; font-weight: 700; white-space: nowrap; }
  .hd .u { text-decoration: underline; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0 24px; }
  .sec { font-style: italic; font-weight: 700; text-align: center; margin: 6px 0 2px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; border-bottom: 1px solid #111; padding: 2px 4px; font-size: 10px; font-weight: 700; }
  th.num, td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td { padding: 1px 4px; vertical-align: top; }
  .tot { margin: 8px 0; border-top: 1px solid #111; border-bottom: 1px solid #111; padding: 4px 0; display: flex; gap: 24px; flex-wrap: wrap; }
  .tot b { font-variant-numeric: tabular-nums; }
  .wm { position: relative; }
  .foot { margin-top: 10px; font-size: 9px; color: #555; border-top: 1px solid #ddd; padding-top: 6px; }
  .sheet + .sheet { page-break-before: always; }
  @page { size: letter; margin: 12mm; }
`;

function headerHtml(h) {
  const f = (k, v, underline) => `<div class="f"><span class="k ${underline ? "u" : ""}">${esc(k)}</span><span>${esc(v ?? "—")}</span></div>`;
  return `<div class="hd">
    ${f("Employé", h.employeeNumber, true)} ${f("Date", h.date, true)}
    ${f("Nom", h.name, true)} ${f("No. réf.", h.ref, true)}
    ${f("Occupation", "Électricien", true)} ${f("Période de paie", `${h.periodStart || "—"} au ${h.periodEnd || "—"}`, true)}
    ${f("Province", "Québec", true)} ${f("Semaine", h.week, true)}
    ${f("Gains", h.gains ? `$${h.gains}` : "—", true)} ${f("Paie nette", h.paieNette ? `$${h.paieNette}` : "—", true)}
    ${f("Retenues", h.retenues ? `$${h.retenues}` : "—", true)} ${f("CCQ #", h.ccqNumber, true)}
    ${f("Gains imposables - Fédéral", h.imposableFederal ? `$${h.imposableFederal}` : "—", true)} ${f("Gains imposables - Provincial", h.imposableProvincial ? `$${h.imposableProvincial}` : "—", true)}
    ${f("RBQ #", h.rbq, true)} <div></div>
  </div>`;
}

// One talon's inner markup. `data` = { header, transactions[], sommaire[] }.
export function legacyTalonSheet(data) {
  const h = data.header || {};
  const txRows = (data.transactions || []).map((r) => `<tr>
    <td>${esc(r.description)}</td>
    <td class="num">${r.unite == null ? "" : num2(r.unite)}</td>
    <td class="num">${r.taux == null ? "" : num4(r.taux)}</td>
    <td class="num">${money(r.montant)}</td></tr>`).join("");
  const somRows = (data.sommaire || []).map((r) => `<tr>
    <td>${esc(r.description)}</td>
    <td class="num">${isHours(r) ? num2(r.periode) : money(r.periode)}</td>
    <td class="num">${isHours(r) ? num2(r.cumulatif) : money(r.cumulatif)}</td></tr>`).join("");

  return `<div class="sheet">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
      <div style="font-weight:700;font-size:13px;">${esc(EMPLOYER)}</div>
      <div style="font-size:10px;color:#555;">Talon de paie — reproduction</div>
    </div>
    ${headerHtml(h)}
    <div class="tot">
      <span>Gains <b>${h.gains ? `$${esc(h.gains)}` : "—"}</b></span>
      <span>Retenues <b>${h.retenues ? `$${esc(h.retenues)}` : "—"}</b></span>
      <span>Paie nette <b>${h.paieNette ? `$${esc(h.paieNette)}` : "—"}</b></span>
    </div>
    <div class="cols">
      <div>
        <div class="sec">Transactions</div>
        <table><thead><tr><th>Description</th><th class="num">Unité</th><th class="num">Taux</th><th class="num">Montant</th></tr></thead>
        <tbody>${txRows}</tbody></table>
      </div>
      <div>
        <div class="sec">Sommaire</div>
        <table><thead><tr><th>Description</th><th class="num">Période</th><th class="num">Cumulatif</th></tr></thead>
        <tbody>${somRows}</tbody></table>
      </div>
    </div>
    <div class="foot">Talon importé (ancien système) — reproduit tel qu'importé pour les archives et le relevé d'emploi. Ne remplace pas le talon d'origine.</div>
  </div>`;
}

export function legacyTalonDocument(sheets, title = "Talon (importé)") {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${LEGACY_TALON_STYLES}</style></head><body>${sheets.join("\n")}</body></html>`;
}

export function printLegacyTalon(data, title) {
  const w = window.open("", "_blank", "width=860,height=1100");
  if (!w) return false;
  w.document.open();
  w.document.write(legacyTalonDocument([legacyTalonSheet(data)], title));
  w.document.close();
  w.onload = () => { w.focus(); w.print(); };
  setTimeout(() => { try { w.focus(); w.print(); } catch { /* onload handles it */ } }, 500);
  return true;
}
