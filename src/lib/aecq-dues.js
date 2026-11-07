// AECQ annual base contribution (cotisation annuelle de base à l'Association des entrepreneurs en
// construction du Québec). The CCQ bills it as a manual invoice (site « État de compte › Factures
// manuelles ») with the October monthly report; it is NOT part of the weekly hourly AECQ amount
// (0,03 $/h). Amounts before taxes, by report year. A year missing here shows no amount.
export const AECQ_BASE_DUES = Object.freeze({ 2026: 240, 2027: 245 });

// Reminder shown when preparing the October monthly report. `month` = 'YYYY-MM' (the reporting month).
// Returns { year, amount } (amount null when unknown) for an October month, else null.
export function aecqOctoberReminder(month) {
  const match = /^(\d{4})-10$/.exec(String(month || ""));
  if (!match) return null;
  const year = Number(match[1]);
  return { year, amount: AECQ_BASE_DUES[year] ?? null };
}
