import dayjs from "dayjs";
import { calculatePayrollEntries, roundHours } from "./payroll-calculations";

const COMMERCIAL_SECTOR_CODE = "I";
const ELECTRICIAN_TRADE_CODE = "220";

export function weekEndingSaturday(date) {
  const value = dayjs(date);
  if (!value.isValid()) return "";
  return value.add((6 - value.day() + 7) % 7, "day").format("YYYY-MM-DD");
}

export function buildCcqWeeklyRecords(jobs, profilesById) {
  const groups = new Map();
  const sortedJobs = [...jobs].sort((a, b) => `${a.job_date}${a.depart || ""}`.localeCompare(`${b.job_date}${b.depart || ""}`));
  const payrollEntries = calculatePayrollEntries(sortedJobs);

  for (const job of sortedJobs) {
    const profile = profilesById.get(job.user_id) || {};
    const dateSFL = weekEndingSaturday(job.job_date);
    const secteur = COMMERCIAL_SECTOR_CODE;
    const key = [job.user_id, dateSFL, ELECTRICIAN_TRADE_CODE, secteur, profile.work_region, profile.wage_schedule].join("|");
    if (!groups.has(key)) {
      groups.set(key, {
        nas: profile.nas_employee || null,
        semaineFinissantLe: dateSFL,
        codeMetier: ELECTRICIAN_TRADE_CODE,
        secteurActivite: secteur,
        region: profile.work_region || null,
        annexe: profile.wage_schedule || null,
        tauxHoraire: profile.hourly_rate == null ? null : Number(profile.hourly_rate),
        heuresRegulieres: 0,
        heuresSup50: 0,
        heuresSup100: 0,
        _regularMinutes: 0,
        _regularWorkMinutes: 0,
        _sup50Minutes: 0,
        _sup100Minutes: 0,
        _entryIds: [],
      });
    }

    const record = groups.get(key);
    const entry = payrollEntries.get(job.id);
    let regularWork = entry.regularWorkMinutes;
    let sup50 = entry.overtime50Minutes;
    let sup100 = entry.overtime100Minutes;

    const weeklyRegularRoom = Math.max(0, 40 * 60 - record._regularWorkMinutes);
    if (regularWork > weeklyRegularRoom) {
      sup50 += regularWork - weeklyRegularRoom;
      regularWork = weeklyRegularRoom;
    }
    record._regularWorkMinutes += regularWork;
    record._regularMinutes += regularWork + entry.returnRegularMinutes;
    record._sup50Minutes += sup50;
    record._sup100Minutes += sup100;
    record._entryIds.push(job.id);
  }

  return [...groups.values()].map((record) => {
    record.heuresRegulieres = roundHours(record._regularMinutes);
    record.heuresSup50 = roundHours(record._sup50Minutes);
    record.heuresSup100 = roundHours(record._sup100Minutes);
    record.sourceEntryIds = record._entryIds;
    delete record._regularMinutes;
    delete record._regularWorkMinutes;
    delete record._sup50Minutes;
    delete record._sup100Minutes;
    delete record._entryIds;
    return record;
  });
}

export function missingCcqFields(record) {
  return ["nas", "semaineFinissantLe", "codeMetier", "secteurActivite", "region", "annexe", "tauxHoraire"]
    .filter((field) => record[field] == null || record[field] === "");
}
