import { isOffOn } from "./timeoff";

// Missing-entry auditing began after the previous five-day work week. Keep those
// untracked days out of every employee's displayed baseline and never show negatives.
export const MISSING_ENTRY_BASELINE_DAYS = 5;

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

// The recap and its dialog deliberately share this list so their totals cannot drift.
// Partial-day entries count as leave, while paused accounts never do.
export function activePeopleOnLeave(people, timeOffRows, date) {
  const offUserIds = new Set((timeOffRows || []).filter((row) => isOffOn(row, date)).map((row) => row.user_id));
  return (people || [])
    .filter((person) => !person.is_paused && offUserIds.has(person.id))
    .map((person) => ({ id: person.id, name: person.full_name || person.email || person.id }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Count the dates on which a regular crew member would have appeared red on Live Crew:
// the account was expected on the board, had no job at all, and was not away all day.
export function missingEntryDays(people, jobs, timeOffRows, startDate, endDate) {
  const jobKeys = new Set((jobs || []).map((job) => `${job.user_id}:${job.job_date}`));
  const result = [];

  for (const person of (people || []).filter(isRegularCrew)) {
    let count = 0;
    for (let date = startDate; date && date <= endDate; date = dayAfter(date)) {
      const fullyOff = (timeOffRows || []).some((row) => row.user_id === person.id && !row.start_time && isOffOn(row, date));
      if (!fullyOff && !jobKeys.has(`${person.id}:${date}`)) count++;
    }
    result.push({
      id: person.id,
      name: person.full_name || person.email || person.id,
      count: Math.max(0, count - MISSING_ENTRY_BASELINE_DAYS),
    });
  }

  return result.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function dayAfter(date) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
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
