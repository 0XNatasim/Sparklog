import dayjs from "dayjs";

export function minutesBetween(depart, fin) {
  if (!depart || !fin) return 0;
  const [startHour, startMinute] = String(depart).slice(0, 5).split(":").map(Number);
  const [endHour, endMinute] = String(fin).slice(0, 5).split(":").map(Number);
  if ([startHour, startMinute, endHour, endMinute].some(Number.isNaN)) return 0;
  let minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  if (minutes < 0) minutes += 24 * 60;
  return Math.max(0, minutes);
}

export function getKilometreBreakdown(job) {
  const legacyClient = Math.max(0, Number(job.km_aller) || 0);
  const returnKm = Math.max(0, Number(job.km_retour) || 0);
  const totalKm = Math.max(0, Number(job.km_total) || legacyClient + returnKm);
  return {
    totalKm,
    returnKm: Math.min(returnKm, totalKm),
    clientKm: Math.max(0, totalKm - returnKm),
  };
}

// Payroll week runs to the Saturday that ends it (matches the CCQ weekly grouping in
// ccq-export). Used to scope the 1.5x overtime allowance to the week, not the day.
function payrollWeekKey(jobDate) {
  const d = dayjs(jobDate);
  if (!d.isValid()) return String(jobDate || "");
  return d.add((6 - d.day() + 7) % 7, "day").format("YYYY-MM-DD");
}

export function calculatePayrollEntries(jobs) {
  const sorted = [...jobs].sort((a, b) => `${a.job_date}${a.depart || ""}${a.id || ""}`.localeCompare(`${b.job_date}${b.depart || ""}${b.id || ""}`));
  // Regular hours are capped per DAY (8h); the first hour of overtime is allowed once
  // per WEEK at 1.5x, everything beyond that is 2x. Jobs are processed chronologically
  // so the earliest overtime of the week consumes the 1.5x allowance first.
  const dayWorkMinutes = new Map();      // job_date -> minutes worked so far that day
  const weekOvertimeMinutes = new Map(); // week key -> overtime minutes so far that week
  const entries = new Map();

  for (const job of sorted) {
    const wk = payrollWeekKey(job.job_date);
    const priorDayWork = dayWorkMinutes.get(job.job_date) || 0;
    const priorWeekOvertime = weekOvertimeMinutes.get(wk) || 0;

    const workMinutes = minutesBetween(job.depart, job.fin);
    const regularRoom = Math.max(0, 480 - priorDayWork);
    const regularWorkMinutes = Math.min(workMinutes, regularRoom);
    const overtimeWorkMinutes = workMinutes - regularWorkMinutes;
    const overtime50Room = Math.max(0, 60 - priorWeekOvertime);
    const overtime50Minutes = Math.min(overtimeWorkMinutes, overtime50Room);
    const overtime100Minutes = overtimeWorkMinutes - overtime50Minutes;
    const returnRegularMinutes = Math.max(0, Number(job.return_time_minutes) || 0);
    const kilometres = getKilometreBreakdown(job);

    entries.set(job.id, {
      job,
      regularWorkMinutes,
      overtime50Minutes,
      overtime100Minutes,
      overtimeWorkMinutes,
      returnRegularMinutes,
      regularPaidMinutes: regularWorkMinutes + returnRegularMinutes,
      totalPaidMinutes: workMinutes + returnRegularMinutes,
      ...kilometres,
    });
    dayWorkMinutes.set(job.job_date, priorDayWork + workMinutes);
    weekOvertimeMinutes.set(wk, priorWeekOvertime + overtimeWorkMinutes);
  }
  return entries;
}

export function calculateDailyTotals(jobs) {
  const entries = calculatePayrollEntries(jobs);
  const days = new Map();
  for (const entry of entries.values()) {
    const date = entry.job.job_date;
    const day = days.get(date) || {
      jobDate: date,
      regularWorkMinutes: 0,
      overtime50Minutes: 0,
      overtime100Minutes: 0,
      overtimeWorkMinutes: 0,
      returnRegularMinutes: 0,
      totalPaidMinutes: 0,
      clientKm: 0,
      returnKm: 0,
      totalKm: 0,
      jobCount: 0,
    };
    for (const key of ["regularWorkMinutes", "overtime50Minutes", "overtime100Minutes", "overtimeWorkMinutes", "returnRegularMinutes", "totalPaidMinutes", "clientKm", "returnKm", "totalKm"]) {
      day[key] += entry[key];
    }
    day.jobCount += 1;
    days.set(date, day);
  }
  return days;
}

export function isMealEligible({ jobDate, dailyWorkMinutes }) {
  const weekday = dayjs(jobDate).day();
  return weekday !== 0 && weekday !== 6 && Math.max(0, dailyWorkMinutes - 480) >= 135;
}

export function roundHours(minutes) {
  return Math.round((minutes / 60) * 100) / 100;
}
