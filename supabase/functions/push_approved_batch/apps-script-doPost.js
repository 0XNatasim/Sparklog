// Paste this into your Google Apps Script project, overwriting your current
// doPost(). It accepts BOTH shapes:
//
//   - Single row (legacy, from push_approved_to_sheet):
//       { token, job_id, job_date, employee_name, ..., approved_at, approved_by }
//
//   - Batch (from push_approved_batch):
//       { token, rows: [ { job_id, job_date, employee_name, ... }, ... ] }
//
// COLUMN LAYOUT written to the master tab "Data" (formerly "Feuille 1"; both
// names are accepted):
//   A Date · B Employé · C Courriel · D Téléphone · E OT · F Départ ·
//   G Arrivée · H Fin · I Heures · J KM · K Approuvé par · L Approuvé le ·
//   M JobID  (dedup key — you can hide this column)
//   N Trajet non payé (min) · O Heures payées   (added for the "premier déplacement
//     non payé" employee option — see below)
//
// FIRST TRIP UNPAID: when a row carries employee_first_trip_unpaid = true, the time
// between Départ and Arrivée of that employee's FIRST job of the day (earliest Départ,
// ties broken by job id — same order as SparkLog's payroll engine) is not paid. Column
// I (Heures) still shows the full Départ→Fin span; column N holds the unpaid minutes and
// column O the paid hours (I minus N). Rows of other jobs, employees without the option,
// and jobs with no Arrivée get N = 0 and O = I. If an earlier job of the same day is
// exported after a later one, the unpaid minutes move to the earlier job.
//
// IDEMPOTENCY: each row carries a job_id, stored in column M. Before appending
// we read every job_id already in column M and skip any incoming row that's
// already there. So posting the same job twice — a retry, a double-click, or
// two managers exporting at once — never creates a duplicate row. A ScriptLock
// serializes concurrent posts so the "read existing ids -> append new" step is
// race-free.
//
// After saving, do Deploy -> Manage deployments -> Edit -> New version ->
// Deploy. Otherwise the web app keeps serving the old code.

var JOB_ID_COL = 13;   // column M
var UNPAID_COL = 14;   // column N  Trajet non payé (min)
var PAID_COL = 15;     // column O  Heures payées
var LAST_COL = 15;

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000); // wait up to 30s for an in-flight post to finish
  } catch (lockErr) {
    return jsonOut({ success: false, error: "Busy — another export is running, please retry" });
  }

  try {
    var data = JSON.parse(e.postData.contents);

    var expected = PropertiesService.getScriptProperties().getProperty("TOKEN");
    if (!expected || data.token !== expected) {
      return jsonOut({ success: false, error: "Unauthorized" });
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Data") || ss.getSheetByName("Feuille 1");
    if (!sheet) {
      return jsonOut({ success: false, error: "Sheet not found" });
    }

    var inputRows = Array.isArray(data.rows) ? data.rows : [data];

    // job_ids already in the sheet (column M) + the rows needed to find each day's
    // first job (date, employee, Départ, Arrivée, current unpaid minutes).
    var existing = {};
    var lastRow = sheet.getLastRow();
    var tz = ss.getSpreadsheetTimeZone();
    var sheetJobs = [];
    if (lastRow >= 1) {
      var width = Math.max(sheet.getLastColumn(), LAST_COL);
      var vals = sheet.getRange(1, 1, lastRow, width).getValues();
      var disp = sheet.getRange(1, 1, lastRow, width).getDisplayValues();
      for (var i = 0; i < vals.length; i++) {
        var v = vals[i][JOB_ID_COL - 1];
        if (v !== "" && v !== null) existing[String(v)] = true;
        if (i === 0) continue; // header row
        sheetJobs.push({
          row: i + 1,
          key: empKey(disp[i][1], disp[i][2]) + "|" + dateKey(vals[i][0], tz),
          depart: parseHM(disp[i][5]),
          id: String(v == null ? "" : v),
          unpaid: Number(vals[i][UNPAID_COL - 1]) || 0,
          heures: disp[i][8],
        });
      }
    }

    // Keep only rows whose job_id we haven't written yet (also dedup within
    // the incoming batch).
    var toWrite = [];
    var skippedIds = [];
    for (var j = 0; j < inputRows.length; j++) {
      var d = inputRows[j];
      var jobId = d.job_id != null ? String(d.job_id) : "";
      if (jobId && existing[jobId]) { skippedIds.push(jobId); continue; }
      if (jobId) existing[jobId] = true;
      toWrite.push({ d: d, jobId: jobId });
    }

    // Decide, per incoming row, whether it is its day's first job and how many
    // minutes of travel are unpaid. `peers` = every job of that employee+day known so
    // far (already in the sheet + earlier incoming rows).
    var clears = []; // existing rows that lose their unpaid minutes
    var out = [];
    for (var k = 0; k < toWrite.length; k++) {
      var row = toWrite[k].d;
      var dep = parseHM(row.depart);
      var key = empKey(row.employee_name, row.employee_email) + "|" + dateKey(row.job_date, tz);
      var me = { key: key, depart: dep, id: toWrite[k].jobId };
      var unpaid = 0;
      if (row.employee_first_trip_unpaid === true) {
        var isFirst = true;
        for (var m = 0; m < sheetJobs.length; m++) {
          if (sheetJobs[m].key === key && jobBefore(sheetJobs[m], me)) { isFirst = false; break; }
        }
        if (isFirst) {
          var arr = parseHM(row.arrivee), fin = parseHM(row.fin);
          if (dep !== null && arr !== null) {
            var span = spanMinutes(dep, fin);
            unpaid = Math.min(spanMinutes(dep, arr), span === null ? Infinity : span);
          }
          // The unpaid trip now belongs to this (earlier) job, not a later one.
          for (var c = 0; c < sheetJobs.length; c++) {
            if (sheetJobs[c].key === key && sheetJobs[c].unpaid > 0) {
              if (sheetJobs[c].row) clears.push(sheetJobs[c].row);
              else { // earlier row of this same batch, not written yet
                out[sheetJobs[c].outIdx][UNPAID_COL - 1] = 0;
                out[sheetJobs[c].outIdx][PAID_COL - 1] = out[sheetJobs[c].outIdx][8];
              }
              sheetJobs[c].unpaid = 0;
            }
          }
        }
      }
      me.unpaid = unpaid;
      me.outIdx = out.length;
      sheetJobs.push(me);
      out.push(rowFrom(row).concat([toWrite[k].jobId, unpaid, paidHours(row.heures, unpaid)]));
    }

    if (out.length > 0) {
      var startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, out.length, out[0].length).setValues(out);
      if (!sheet.getRange(1, UNPAID_COL).getValue()) sheet.getRange(1, UNPAID_COL).setValue("Trajet non payé (min)");
      if (!sheet.getRange(1, PAID_COL).getValue()) sheet.getRange(1, PAID_COL).setValue("Heures payées");
      for (var x = 0; x < clears.length; x++) {
        var r = clears[x];
        sheet.getRange(r, UNPAID_COL).setValue(0);
        sheet.getRange(r, PAID_COL).setValue(sheet.getRange(r, 9).getDisplayValue());
      }
    }

    return jsonOut({
      success: true,
      written: out.length,
      skipped: skippedIds.length,
      skipped_ids: skippedIds,
    });
  } catch (err) {
    return jsonOut({ success: false, error: err.message });
  } finally {
    lock.releaseLock();
  }
}

// Build one visible row (columns A–L). Column M (job_id) is appended by the
// caller. KM uses the outbound distance (km_aller); ask if you want the return
// distance/time added as extra columns.
function rowFrom(d) {
  return [
    d.job_date,      // A Date
    d.employee_name, // B Employé
    d.employee_email,// C Courriel
    d.employee_phone,// D Téléphone
    d.ot,            // E OT
    d.depart,        // F Départ
    d.arrivee,       // G Arrivée
    d.fin,           // H Fin
    d.heures,        // I Heures
    d.km_aller,      // J KM
    d.approved_by,   // K Approuvé par
    d.approved_at,   // L Approuvé le
  ];
}

// ---- first-trip-unpaid helpers ---------------------------------------------

function empKey(name, email) {
  return String(email || name || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function dateKey(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, "yyyy-MM-dd");
  return String(v || "").slice(0, 10);
}

// "H:MM" / "HH:MM" (display value or JSON string) -> minutes since midnight, or null.
function parseHM(v) {
  var m = /^(\d{1,2}):(\d{2})/.exec(String(v == null ? "" : v).trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// Minutes from a to b, wrapping past midnight; null when either is missing.
function spanMinutes(a, b) {
  if (a === null || b === null) return null;
  var d = b - a;
  return d < 0 ? d + 1440 : d;
}

// Same ordering as the payroll engine: Départ, then job id (missing Départ sorts last).
function jobBefore(a, b) {
  var da = a.depart === null ? 1e9 : a.depart, db = b.depart === null ? 1e9 : b.depart;
  if (da !== db) return da < db;
  return String(a.id) < String(b.id);
}

// "8h30" minus unpaid minutes -> "7h45" (same format as the Heures column).
function paidHours(heures, unpaid) {
  var m = /^(\d+)h(\d{2})$/.exec(String(heures || ""));
  if (!m) return heures || "";
  var total = Math.max(0, Number(m[1]) * 60 + Number(m[2]) - (unpaid || 0));
  return Math.floor(total / 60) + "h" + ("0" + (total % 60)).slice(-2);
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
