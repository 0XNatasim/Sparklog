// Forms are links (Microsoft Forms, Teams…) an owner/manager publishes in every employee's
// Profile. Keep in step with employee_forms_content_check (migration 0079).
export const FORM_NAME_MAX = 200;
export const FORM_URL_MAX = 2000;

export function isHttpUrl(value) {
  const url = String(value ?? "").trim();
  return url.length > 0 && url.length <= FORM_URL_MAX && /^https?:\/\/\S+$/i.test(url);
}

// Returns the invalid field keys: "name" (at least one language, each ≤ 200) and "url".
export function validateManagedForm(values) {
  const errors = [];
  const fr = String(values.name_fr ?? "").trim();
  const en = String(values.name_en ?? "").trim();
  if ((!fr && !en) || fr.length > FORM_NAME_MAX || en.length > FORM_NAME_MAX) errors.push("name");
  if (!isHttpUrl(values.url)) errors.push("url");
  return errors;
}

export function buildFormRow(values) {
  return {
    name_fr: String(values.name_fr ?? "").trim() || null,
    name_en: String(values.name_en ?? "").trim() || null,
    url: String(values.url ?? "").trim(),
    employee_specific: Boolean(values.employee_specific),
  };
}
