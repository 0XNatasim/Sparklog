// One employee's TD1 / TP-1015.3 amounts, fixed weekly pay and EI / QPP exemptions
// (employee_tax_profiles, manager tier only: RLS 0083). Shared by Paramètres › Paie (V2) and the
// V3 employee card, so both read and save the row the same way.

export const TAX_FIELDS = Object.freeze([
  { key: "td1_claim_amount", labelKey: "payrollSettings.td1" },
  { key: "federal_additional_tax", labelKey: "payrollSettings.td1Extra" },
  { key: "tp1015_3_credits", labelKey: "payrollSettings.tp1015" },
  { key: "quebec_additional_tax", labelKey: "payrollSettings.tp1015Extra" },
]);

// "" → null (empty field), a number ≥ 0, or NaN (not a valid amount).
export function parseAmount(value) {
  const text = String(value ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (text === "") return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

const asText = (value) => (value == null ? "" : String(value));
// An additional tax of 0 shows as an empty field.
const extraText = (value) => asText(value && Number(value) ? value : "");

// Editable form of a profile and its tax row (missing row = every field empty).
export function taxFormRow(profile, form = {}) {
  const f = form || {};
  return {
    id: profile.id,
    name: profile.full_name || profile.email || profile.id,
    paused: profile.is_paused,
    td1_claim_amount: asText(f.td1_claim_amount),
    federal_additional_tax: extraText(f.federal_additional_tax),
    tp1015_3_credits: asText(f.tp1015_3_credits),
    quebec_additional_tax: extraText(f.quebec_additional_tax),
    forms_received_on: f.forms_received_on || "",
    hourly_rate: Number(profile.hourly_rate) || 0,
    fixed_weekly_hours: asText(f.fixed_weekly_hours),
    fixed_pay_start: f.fixed_pay_start || "",
    ei_exempt: Boolean(f.ei_exempt),
    rrq_exempt: Boolean(f.rrq_exempt),
  };
}

// The row to upsert, or { error } with the i18n key of the problem. Fixed hours: (0, 80].
export function taxProfileUpsert(row, updatedBy = null, now = new Date()) {
  const values = Object.fromEntries(TAX_FIELDS.map(({ key }) => [key, parseAmount(row[key])]));
  const fixedHours = parseAmount(row.fixed_weekly_hours);
  if (Object.values(values).some((v) => Number.isNaN(v)) || Number.isNaN(fixedHours) || (fixedHours != null && (fixedHours <= 0 || fixedHours > 80))) {
    return { error: "payrollSettings.invalid" };
  }
  if (fixedHours && !row.fixed_pay_start) return { error: "payrollSettings.fixedStartRequired" };
  return {
    payload: {
      user_id: row.id,
      td1_claim_amount: values.td1_claim_amount,
      federal_additional_tax: values.federal_additional_tax ?? 0,
      tp1015_3_credits: values.tp1015_3_credits,
      quebec_additional_tax: values.quebec_additional_tax ?? 0,
      forms_received_on: row.forms_received_on || null,
      fixed_weekly_hours: fixedHours,
      fixed_pay_start: fixedHours ? row.fixed_pay_start : null,
      ei_exempt: row.ei_exempt,
      rrq_exempt: row.rrq_exempt,
      updated_at: now.toISOString(),
      updated_by: updatedBy,
    },
  };
}
