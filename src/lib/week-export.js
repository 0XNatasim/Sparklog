// The week overview (one row per employee, one pair of columns per day) as the rows of a spreadsheet.
// `rows` = buildWeekRows(...), `days` = the 7 dates (Sunday → Saturday), `t` = the i18n function.
// Header on two lines: line 1 = the day (merged over its two columns), line 2 = Heures · Km. Hours are decimal numbers, a day
// with no job is an empty cell (never 0).
import dayjs from "dayjs";
import { columnName } from "@/lib/xlsx-write";

const round2 = (value) => Math.round(value * 100) / 100;

export function weekTable(rows, days, t) {
  const top = [t("live.week.employee")];
  const bottom = [""];
  const merges = ["A1:A2"];
  days.forEach((date, index) => {
    const first = 1 + index * 2;
    top.push(dayjs(date).format("ddd D MMM"), "");
    bottom.push(t("week.export.hours"), t("week.export.km"));
    merges.push(`${columnName(first)}1:${columnName(first + 1)}1`);
  });
  const totalAt = 1 + days.length * 2;
  top.push(t("live.week.total"), "", t("week.export.paid"));
  bottom.push(t("week.export.hours"), t("week.export.km"), "");
  merges.push(`${columnName(totalAt)}1:${columnName(totalAt + 1)}1`, `${columnName(totalAt + 2)}1:${columnName(totalAt + 2)}2`);
  const body = (rows || []).map(({ employee, cells, total, totalKm, round }) => [
    employee.full_name || employee.email || "",
    ...cells.flatMap((cell) => (cell.count > 0 ? [round2(cell.hours), Math.round(cell.km)] : ["", ""])),
    round2(total),
    Math.round(totalKm),
    round.days > 0 ? round2(round.paid / 60) : "",
  ]);
  return { headers: [top, bottom], merges, rows: body };
}

export const WEEK_WIDTHS = [26, ...Array(14).fill(9), 10, 9, 12];

export function weekFileName(weekStart, weekEnd) {
  return `semaine ${weekStart} au ${weekEnd}.xlsx`;
}
