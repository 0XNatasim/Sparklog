function endMinutes(job) {
  if (job.ended_at) return Date.parse(job.ended_at) / 60000;
  const time = String(job.fin || job.depart || "00:00").slice(0, 5);
  return Date.parse(`${job.job_date}T${time}:00`) / 60000;
}

// The overtime clock belongs on the day's chronologically last job, not on whichever
// job happened to be saved when the evidence was captured.
export function lastOvertimeJobIds(jobs) {
  const latestByDay = new Map();
  const overtimeDays = new Set();
  for (const job of jobs) {
    const day = `${job.user_id}|${job.job_date}`;
    if (job.overtime_evidence_captured) overtimeDays.add(day);
    const latest = latestByDay.get(day);
    if (!latest || endMinutes(job) > endMinutes(latest)) latestByDay.set(day, job);
  }
  return new Set([...overtimeDays].map((day) => latestByDay.get(day).id));
}

// Alternating band (0/1) per work date, newest date first, so the same date gets the
// same shade in every timesheet column.
export function dateBandMap(dates) {
  const unique = [...new Set(dates.filter(Boolean))].sort().reverse();
  return new Map(unique.map((date, index) => [date, index % 2]));
}
