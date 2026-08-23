export const LEVEL_TO_SKILL = {
  compagnon: "6",
  apprenti_4: "4",
  apprenti_3: "3",
  apprenti_2: "2",
  apprenti_1: "1",
};

export const COMMERCIAL_RATE_SECTOR = "C";

export function extractRateAnnexes(rawJson) {
  const annexes = Array.isArray(rawJson?.Annexes) ? rawJson.Annexes : [];
  const values = annexes.map((item) => ({ code: item.cd_annexe, description: item.desc_annexe || "" })).filter((item) => item.code);
  if (values.length) return values;
  const regular = rawJson?.AnnexesRates?.["Taux horaire"]?.find((item) => item.Name === "Régulier");
  return Object.keys(regular?.Rates || {}).map((code) => ({ code, description: "" }));
}

export function extractRegularHourlyRate(rawJson, requestedAnnexCode) {
  const group = rawJson?.AnnexesRates?.["Taux horaire"];
  if (!Array.isArray(group)) return null;
  const row = group.find((item) => item.Name === "Régulier");
  if (!row?.Rates) return null;
  const annexes = Array.isArray(rawJson?.Annexes) ? rawJson.Annexes : [];
  const annexCode = annexes.find((item) => item.cd_annexe === requestedAnnexCode)?.cd_annexe
    || annexes.find((item) => item.cd_annexe === "C3")?.cd_annexe
    || annexes[0]?.cd_annexe
    || Object.keys(row.Rates)[0];
  const rate = Number.parseFloat(String(row.Rates[annexCode] ?? "").replace(",", "."));
  return Number.isFinite(rate) ? rate : null;
}
