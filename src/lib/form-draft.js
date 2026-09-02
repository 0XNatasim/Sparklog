// Offline-safe local autosave for the new time-sheet entry. Keeps whatever the
// employee has typed in the browser so a dropped connection, an accidental
// refresh, or the app closing never loses their work. It only holds the current
// unsaved NEW entry (not edits); it's cleared the moment the entry saves.
const PREFIX = "sparklog:draft:";

const FIELDS = ["job_date", "ot", "depart", "arrivee", "fin", "km_aller"];

function keyFor(userId) {
  return `${PREFIX}${userId}`;
}

// True when the draft has anything worth keeping (ignore a lone default date).
function hasContent(values) {
  return ["ot", "depart", "arrivee", "fin", "km_aller"].some((f) => String(values?.[f] ?? "").trim() !== "");
}

export function saveDraft(userId, values) {
  if (!userId) return;
  try {
    if (!hasContent(values)) {
      localStorage.removeItem(keyFor(userId));
      return;
    }
    const slim = {};
    for (const f of FIELDS) slim[f] = values[f] ?? "";
    slim._savedAt = Date.now();
    localStorage.setItem(keyFor(userId), JSON.stringify(slim));
  } catch {
    // Storage unavailable (private mode, quota) — silently skip; autosave is best-effort.
  }
}

export function loadDraft(userId) {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(keyFor(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return hasContent(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearDraft(userId) {
  if (!userId) return;
  try {
    localStorage.removeItem(keyFor(userId));
  } catch {
    // ignore
  }
}
