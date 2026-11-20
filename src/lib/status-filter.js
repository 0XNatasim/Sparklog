// Management timesheet, one employee selected: the four piles of jobs (one per status) and which one the phone shows.
export const STATUS_KEYS = ["saved", "updated", "submitted", "approved"];
export const STATUS_LABELS = {
  saved: "manager.savedSection",
  updated: "manager.updatedSection",
  submitted: "manager.submittedSection",
  approved: "status.approved",
};

// Pile the phone starts on: the one a link asks for (?status=submitted), else "all" (Tout: the four piles together).
export function initialPile(value) {
  return STATUS_KEYS.includes(value) ? value : "all";
}
