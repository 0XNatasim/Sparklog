import React, { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/use-t";
import { useHolidayDates } from "@/lib/company-holidays";
import { addCalendarDays, companyDate } from "@/lib/company-time";
import { weekStartSundayD } from "@/lib/ccq-week";
import { buildWeekRows, loadWeekData } from "@/lib/week-rows";
import { weekTable, weekFileName, WEEK_WIDTHS } from "@/lib/week-export";
import { buildXlsx } from "@/lib/xlsx-write";
import { downloadFile, XLSX_TYPE } from "@/lib/download-file";

// « Télécharger la semaine »: the week overview (the snapshot's table) as a spreadsheet. `weekOffset` 0 = this week, -1 = last week.
export default function WeekDownload({ weekOffset = 0 }) {
  const t = useT();
  const holidayDates = useHolidayDates();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function download() {
    setBusy(true);
    setError("");
    try {
      const weekStart = addCalendarDays(weekStartSundayD(companyDate()).format("YYYY-MM-DD"), weekOffset * 7);
      const days = Array.from({ length: 7 }, (_, i) => addCalendarDays(weekStart, i));
      const [people, jobs, timeOff, rounding] = await loadWeekData(weekStart, days[6]);
      if (people.error || jobs.error) throw new Error((people.error || jobs.error).message);
      const rows = buildWeekRows({ people: people.data || [], jobs: jobs.data || [], timeOff: timeOff.data || [], days, holidays: new Set(holidayDates), rounding, weekStart });
      const { headers, merges, rows: body } = weekTable(rows, days, t);
      downloadFile(buildXlsx({ rows: [...headers, ...body], headerRows: 2, merges, widths: WEEK_WIDTHS, sheetName: t("week.export.sheet") }), weekFileName(weekStart, days[6]), XLSX_TYPE);
    } catch (e) {
      setError(e?.message || t("week.export.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={download}>
        <Download className="mr-1.5 h-4 w-4" />{busy ? t("common.working") : t("week.export.button")}
      </Button>
      {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
    </>
  );
}
