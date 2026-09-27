// Product-level read budgets. Keeping these named and tested prevents a new dashboard
// query from silently returning to an unbounded production-table scan.
export const QUERY_BUDGETS = Object.freeze({
  managerJobsPage: 50,
  reviewQueue: 100,
  employeeHistoryPage: 100,
  employeeWeekLookbackWeeks: 12,
  anomalySubmittedJobs: 200,
  anomalyApprovedPeers: 400,
});

