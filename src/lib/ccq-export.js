import dayjs from "dayjs";
import { calculatePayrollEntries, overtimeOptionsFromProfile, roundHours } from "./payroll-calculations";

const COMMERCIAL_SECTOR_CODE = "C";
const ELECTRICIAN_TRADE_CODE = "220";

export function weekEndingSaturday(date) {
  const value = dayjs(date);
  if (!value.isValid()) return "";
  return value.add((6 - value.day() + 7) % 7, "day").format("YYYY-MM-DD");
}

// CCQ appendix codes are written with a hyphen on the monthly report (e.g. "C-3").
// Employee records store the compact rate-table code (e.g. "C3"); normalize on export.
export function formatAppendixCode(code) {
  if (code == null) return null;
  const trimmed = String(code).trim();
  if (trimmed === "") return null;
  return trimmed.replace(/^([A-Za-z]+)-?(\d.*)$/, "$1-$2");
}

export function buildCcqWeeklyRecords(jobs, profilesById) {
  const groups = new Map();
  const sortedJobs = [...jobs].sort((a, b) => `${a.job_date}${a.depart || ""}`.localeCompare(`${b.job_date}${b.depart || ""}`));
  // The overtime split (daily 8h → 1.5x/2x, with a per-week first-hour allowance) is
  // per employee AND depends on each employee's first-hour policy, so compute entries
  // per user — never once across everyone, which would mix the weekly allowance and
  // ignore each person's policy.
  const jobsByUser = new Map();
  for (const job of sortedJobs) {
    if (!jobsByUser.has(job.user_id)) jobsByUser.set(job.user_id, []);
    jobsByUser.get(job.user_id).push(job);
  }
  const payrollEntries = new Map();
  for (const [userId, userJobs] of jobsByUser) {
    const options = overtimeOptionsFromProfile(profilesById.get(userId));
    for (const [jobId, entry] of calculatePayrollEntries(userJobs, options)) {
      payrollEntries.set(jobId, entry);
    }
  }

  for (const job of sortedJobs) {
    const profile = profilesById.get(job.user_id) || {};
    const dateSFL = weekEndingSaturday(job.job_date);
    const secteur = COMMERCIAL_SECTOR_CODE;
    const key = [job.user_id, dateSFL, ELECTRICIAN_TRADE_CODE, secteur, profile.work_region, profile.wage_schedule].join("|");
    if (!groups.has(key)) {
      groups.set(key, {
        nas: profile.nas_employee || null,
        nom: profile.full_name || null,
        semaineFinissantLe: dateSFL,
        codeMetier: ELECTRICIAN_TRADE_CODE,
        secteurActivite: secteur,
        region: profile.work_region || null,
        annexe: formatAppendixCode(profile.wage_schedule),
        union: profile.union_association || null,
        tauxHoraire: profile.hourly_rate == null ? null : Number(profile.hourly_rate),
        heuresRegulieres: 0,
        heuresSup50: 0,
        heuresSup100: 0,
        heuresRetourSansAvantages: 0,
        heuresTotal: 0,
        _regularMinutes: 0,
        _regularWorkMinutes: 0,
        _sup50Minutes: 0,
        _sup100Minutes: 0,
        _returnNbMinutes: 0,
      });
    }

    const record = groups.get(key);
    const entry = payrollEntries.get(job.id);
    let regularWork = entry.regularWorkMinutes;
    let sup50 = entry.overtime50Minutes;
    let sup100 = entry.overtime100Minutes;

    // Weekly overtime: hours beyond 40 regular/week are overtime. Normally the first
    // hour of the week is 1.5x, but an employee whose policy pays the first hour at
    // double time gets this weekly overflow at 2x as well.
    const weeklyRegularRoom = Math.max(0, 40 * 60 - record._regularWorkMinutes);
    if (regularWork > weeklyRegularRoom) {
      const overflow = regularWork - weeklyRegularRoom;
      if (profile.overtime_first_hour_double) sup100 += overflow;
      else sup50 += overflow;
      regularWork = weeklyRegularRoom;
    }
    record._regularWorkMinutes += regularWork;
    record._regularMinutes += regularWork + entry.returnRegularMinutes;
    record._sup50Minutes += sup50;
    record._sup100Minutes += sup100;
    // Return time carved out beyond 8h: paid at base rate, no social benefits. Kept
    // as its own line so the CCQ report / sheet excludes it from the benefit base.
    record._returnNbMinutes += entry.returnNoBenefitMinutes;
  }

  return [...groups.values()].map((record) => {
    record.heuresRegulieres = roundHours(record._regularMinutes);
    record.heuresSup50 = roundHours(record._sup50Minutes);
    record.heuresSup100 = roundHours(record._sup100Minutes);
    record.heuresRetourSansAvantages = roundHours(record._returnNbMinutes);
    record.heuresTotal = roundHours(record._regularMinutes + record._sup50Minutes + record._sup100Minutes + record._returnNbMinutes);
    delete record._regularMinutes;
    delete record._regularWorkMinutes;
    delete record._sup50Minutes;
    delete record._sup100Minutes;
    delete record._returnNbMinutes;
    return record;
  });
}

export function missingCcqFields(record) {
  return ["nas", "nom", "semaineFinissantLe", "codeMetier", "secteurActivite", "region", "annexe", "tauxHoraire"]
    .filter((field) => record[field] == null || record[field] === "");
}
