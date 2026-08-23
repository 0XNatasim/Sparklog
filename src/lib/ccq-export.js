import dayjs from "dayjs";

const SECTOR_CODES = {
  C: "I", // Legacy commercial value.
  I: "I",
  N: "N",
  R: "R",
  L: "H", // Legacy heavy-residential value.
  H: "H",
};

export function weekEndingSaturday(date) {
  const value = dayjs(date);
  if (!value.isValid()) return "";
  return value.add((6 - value.day() + 7) % 7, "day").format("YYYY-MM-DD");
}

function minutesBetween(depart, fin) {
  if (!depart || !fin) return 0;
  const [startHour, startMinute] = String(depart).slice(0, 5).split(":").map(Number);
  const [endHour, endMinute] = String(fin).slice(0, 5).split(":").map(Number);
  if ([startHour, startMinute, endHour, endMinute].some(Number.isNaN)) return 0;
  let minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  if (minutes < 0) minutes += 24 * 60;
  return Math.max(0, minutes);
}

function roundHours(minutes) {
  return Math.round((minutes / 60) * 100) / 100;
}

export function buildCcqWeeklyRecords(jobs, profilesById) {
  const groups = new Map();
  const sortedJobs = [...jobs].sort((a, b) => `${a.job_date}${a.depart || ""}`.localeCompare(`${b.job_date}${b.depart || ""}`));

  for (const job of sortedJobs) {
    const profile = profilesById.get(job.user_id) || {};
    const dateSFL = weekEndingSaturday(job.job_date);
    const secteur = SECTOR_CODES[profile.sector] || profile.sector || null;
    const key = [job.user_id, dateSFL, profile.trade_code, secteur, profile.work_region, profile.wage_schedule].join("|");
    if (!groups.has(key)) {
      groups.set(key, {
        nas: profile.nas_employee || null,
        semaineFinissantLe: dateSFL,
        codeMetier: profile.trade_code || "160",
        secteurActivite: secteur,
        region: profile.work_region || null,
        annexe: profile.wage_schedule || null,
        tauxHoraire: profile.hourly_rate == null ? null : Number(profile.hourly_rate),
        heuresRegulieres: 0,
        heuresSup50: 0,
        heuresSup100: 0,
        _regularMinutes: 0,
        _sup50Minutes: 0,
        _sup100Minutes: 0,
        _entryIds: [],
      });
    }

    const record = groups.get(key);
    const workedMinutes = minutesBetween(job.depart, job.fin) + (Number(job.return_time_minutes) || 0);
    const isSunday = dayjs(job.job_date).day() === 0;
    let regular = isSunday ? 0 : Math.min(workedMinutes, 8 * 60);
    let sup50 = isSunday ? 0 : Math.min(Math.max(0, workedMinutes - 8 * 60), 60);
    let sup100 = isSunday ? workedMinutes : Math.max(0, workedMinutes - 9 * 60);

    const weeklyRegularRoom = Math.max(0, 40 * 60 - record._regularMinutes);
    if (regular > weeklyRegularRoom) {
      sup50 += regular - weeklyRegularRoom;
      regular = weeklyRegularRoom;
    }
    record._regularMinutes += regular;
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
