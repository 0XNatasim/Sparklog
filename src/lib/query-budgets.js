// Product-level read budgets. Keeping these named and tested prevents a new dashboard
// query from silently returning to an unbounded production-table scan.
export const QUERY_BUDGETS = Object.freeze({
  managerJobsPage: 50,
  reviewQueue: 100,
  // « À traiter › OCR »: the latest proof screenshots with what the reader found on each.
  ocrReadings: 300,
  // « À traiter › OCR › Par OT »: every work order of the days Britton sent lines for (all employees; ≈ 200 a day).
  otComparisonJobs: 4000,
  employeeHistoryPage: 100,
  employeeWeekLookbackWeeks: 12,
  anomalySubmittedJobs: 200,
  anomalyApprovedPeers: 400,
  // « À traiter » : every submitted job waiting for approval, oldest first (≈ 170 a day at
  // 60 employees, so a few days of backlog still fit). Separate from the timesheet anomaly scan.
  todoSubmittedJobs: 600,
  todoApprovedPeers: 800,
  // ids per `.in(...)` request, keeps the PostgREST URL short
  inListChunk: 150,
  employeeActivityPage: 200,
  // Journal › Onglets consultés: one row per (manager, day, page, tab); 30 days × a few managers × ~30 tabs.
  pageViews: 1500,
  inventoryPeople: 500,
  inventoryRows: 600,
  inventoryItems: 3000,
  emergencyEmployees: 200,
  emergencyEntries: 50,
  managedForms: 100,
  profileReferences: 200,
  // Profile › Calendrier CCQ: upcoming days of company_holidays (vacations are one row per day).
  ccqCalendar: 200,
  // Gestion › Notes: one person's own notes (and the side-menu badge's open reminders).
  managerNotes: 500,
  // Replies of the notes shown (0118), per request of up to inListChunk notes.
  managerNoteReplies: 2000,
  // Gestion › Registre d'accidents (0120): the most recent files.
  accidentLog: 500,
  // Gestion › Notes › Contremaître (0134): the most recent foreman reports.
  foremanReports: 300,
  // Pictures on the notes (0165): the rows read per request of up to inListChunk notes (10 pictures at most per note).
  noteFiles: 3000,
  // Justificatifs › Télécharger (0126): the pictures still kept (30 days by default) and the ones already downloaded.
  evidenceDownload: 1500,
  // Inventaire › Inventaire fin de mois (0142): the requests read at once (a few people a month, several months).
  monthEndInventory: 300,
});

// A narrowed timesheet search must be complete, not merely filtered from the
// first global page. Requests still use managerJobsPage-sized batches.
export function shouldLoadAllMatchingManagerJobs(employeeId, dayFilter) {
  return employeeId !== "all" || Boolean(dayFilter);
}
