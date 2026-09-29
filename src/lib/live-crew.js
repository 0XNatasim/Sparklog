// Who appears on Live Crew for a given day.
//
// The regular crew shows every day (a card with "no jobs yet" until they enter one).
// Owners, office (admin) staff, people who opted out of the boards, and anyone on a
// full-day congé that day (recurring or not) are hidden by default — but anyone who
// enters a job that day appears, so the board always shows the work actually logged.
// Paused accounts never appear.

const HIDDEN_BY_DEFAULT_ROLES = new Set(["owner", "admin"]);

export function isRegularCrew(person) {
  return !person.is_paused
    && person.show_on_boards !== false
    && !HIDDEN_BY_DEFAULT_ROLES.has(person.role);
}

export function liveRoster(people, { jobUserIds = new Set(), offUserIds = new Set() } = {}) {
  return (people || []).filter((person) => !person.is_paused
    && (jobUserIds.has(person.id) || (isRegularCrew(person) && !offUserIds.has(person.id))));
}

// "Not submitted yesterday": the regular crew who were not off yesterday, plus anyone
// else who logged a job yesterday, minus everyone who submitted (or had approved) a job.
export function notSubmittedYesterday(people, { yesterdayJobs = [], offUserIds = new Set() } = {}) {
  const submitted = new Set(yesterdayJobs.filter((job) => job.status === "submitted" || job.status === "approved").map((job) => job.user_id));
  const worked = new Set(yesterdayJobs.map((job) => job.user_id));
  return (people || []).filter((person) => !person.is_paused
    && !submitted.has(person.id)
    && (worked.has(person.id) || (isRegularCrew(person) && !offUserIds.has(person.id))));
}

// A day's submission state for the Live Crew card edge: "submitted" once every job of
// the day is submitted (or approved), "saved" while any job is still only saved.
export function dayStatus(jobs) {
  if (!jobs?.length) return "none";
  return jobs.every((job) => job.status === "submitted" || job.status === "approved") ? "submitted" : "saved";
}
