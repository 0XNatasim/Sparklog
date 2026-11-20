// Management timesheet: which job statuses are shown. Any combination of the four, all of them by default.
export const STATUS_KEYS = ["saved", "updated", "submitted", "approved"];
export const STATUS_LABELS = {
  saved: "manager.savedSection",
  updated: "manager.updatedSection",
  submitted: "manager.submittedSection",
  approved: "status.approved",
};

// ?status=submitted or ?status=submitted,updated (anything unknown is dropped; nothing valid = all four).
export function parseStatusParam(value) {
  const picked = String(value || "").split(",").map((part) => part.trim()).filter((part) => STATUS_KEYS.includes(part));
  return picked.length ? STATUS_KEYS.filter((key) => picked.includes(key)) : [...STATUS_KEYS];
}

// "all" when the four are shown, else the chosen ones in the usual order, joined by a comma (the URL value).
export function statusKey(statuses) {
  const picked = STATUS_KEYS.filter((key) => statuses.includes(key));
  return picked.length === STATUS_KEYS.length || picked.length === 0 ? "all" : picked.join(",");
}

// Tick / untick one status; the last ticked one cannot be unticked (an empty list would show nothing).
export function toggleStatus(statuses, key) {
  if (statuses.includes(key)) return statuses.length > 1 ? statuses.filter((item) => item !== key) : statuses;
  return STATUS_KEYS.filter((item) => item === key || statuses.includes(item));
}
