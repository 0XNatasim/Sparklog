// Quick-message list for the manager notification panel, kept per device.
//
// The stored state is the full ordered list the manager sees (built-in and own
// messages alike), plus the built-ins already offered once. That lets a manager
// delete or reorder any message, while a built-in added in a later release still
// shows up (appended) without resurrecting the ones they deleted.

export const TEMPLATES_KEY = "sparklog.broadcastTemplates.v2";
export const LEGACY_TEMPLATES_KEY = "sparklog.broadcastTemplates.v1";

const isText = (item) => typeof item === "string" && item.trim() !== "";

// Resolve the list to display from what was stored (v2 state, or the v1 list of
// the manager's own messages) and the current built-ins.
export function resolveTemplates(stored, legacyCustom, builtIns) {
  if (stored && Array.isArray(stored.items)) {
    const items = stored.items.filter(isText);
    const seen = new Set(Array.isArray(stored.seen) ? stored.seen.filter(isText) : []);
    for (const text of builtIns) {
      if (!seen.has(text) && !items.includes(text)) items.push(text);
      seen.add(text);
    }
    return { items, seen: [...seen] };
  }
  const own = (Array.isArray(legacyCustom) ? legacyCustom : []).filter(isText);
  const items = [...builtIns];
  for (const text of own) if (!items.includes(text)) items.push(text);
  return { items, seen: [...builtIns] };
}

export function moveTemplate(items, index, delta) {
  const to = index + delta;
  if (index < 0 || index >= items.length || to < 0 || to >= items.length) return items;
  const next = [...items];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

export function removeTemplate(items, index) {
  return items.filter((_, i) => i !== index);
}

export function addTemplate(items, text) {
  const value = String(text || "").trim();
  if (!value || items.includes(value)) return items;
  return [...items, value];
}

function readJson(key) {
  try {
    return JSON.parse(window.localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

export function loadTemplates(builtIns) {
  return resolveTemplates(readJson(TEMPLATES_KEY), readJson(LEGACY_TEMPLATES_KEY), builtIns);
}

export function saveTemplates(state) {
  try {
    window.localStorage.setItem(TEMPLATES_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable (private mode): the list simply isn't remembered */
  }
}
