// Paste this into your Google Apps Script project, overwriting your current
// doPost(). It accepts BOTH shapes:
//
//   - Single row (legacy, from push_approved_to_sheet):
//       { token, job_id, job_date, employee_name, ..., approved_at, approved_by }
//
//   - Batch (from push_approved_batch):
//       { token, rows: [ { job_id, job_date, employee_name, ... }, ... ] }
//
// COLUMNS ARE FOUND BY THEIR HEADER, NOT BY POSITION. Each value is written under its
// header in row 1 of the master tab "Data" (formerly "Feuille 1"; both names are
// accepted), so the columns can be moved or reordered in the sheet without breaking the
// export. A header that is missing is added at the end of row 1. Header names (accents,
// case and extra spaces do not matter):
//   Date · Employé · Courriel · Téléphone · OT · Départ · Arrivée · Fin · Heures · KM ·
//   Approuvé par · Approuvé le · JobID (dedup key — can be hidden) ·
//   Trajet non payé (min) · Heures payées
// On an empty sheet, row 1 is created in that order. Other columns (your own notes,
// formulas) are left alone. Do not give two columns the same header: the first one wins.
// The « Stats » script (Feuille3) also finds the columns by header, so both stay in step.
//
// FIRST TRIP UNPAID: when a row carries employee_first_trip_unpaid = true, the time
// between Départ and Arrivée of that employee's FIRST job of the day (earliest Départ,
// ties broken by job id — same order as SparkLog's payroll engine) is not paid. « Heures »
// still shows the full Départ→Fin span; « Trajet non payé (min) » holds the unpaid minutes
// and « Heures payées » the paid hours (Heures minus the unpaid minutes). Rows of other
// jobs, employees without the option, and jobs with no Arrivée get 0 and Heures. If an
// earlier job of the same day is exported after a later one, the unpaid minutes move to
// the earlier job.
//
// IDEMPOTENCY: each row carries a job_id, stored under « JobID ». Before appending we
// read every job_id already in that column and skip any incoming row that's already
// there. So posting the same job twice — a retry, a double-click, or two managers
// exporting at once — never creates a duplicate row. A ScriptLock serializes concurrent
// posts so the "read existing ids -> append new" step is race-free.
//
// After saving, do Deploy -> Manage deployments -> Edit -> New version -> Deploy.
// Otherwise the web app keeps serving the old code.

// [header label, field of the incoming row]. Order = layout of a brand-new sheet.
var COLUMNS = [
  ["Date", "job_date"],
  ["Employé", "employee_name"],
  ["Courriel", "employee_email"],
  ["Téléphone", "employee_phone"],
  ["OT", "ot"],
  ["Départ", "depart"],
  ["Arrivée", "arrivee"],
  ["Fin", "fin"],
  ["Heures", "heures"],
  ["KM", "km_aller"],
  ["Approuvé par", "approved_by"],
  ["Approuvé le", "approved_at"],
  ["JobID", "job_id"],
  ["Trajet non payé (min)", "_unpaid"],
  ["Heures payées", "_paid"],
];

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
    var col = ensureHeaders(sheet); // header label -> 1-based column
    var width = Math.max(sheet.getLastColumn(), maxCol(col));

    // job_ids already in the sheet + the rows needed to find each day's first job
    // (date, employee, Départ, current unpaid minutes).
    var existing = {};
    var lastRow = sheet.getLastRow();
    var tz = ss.getSpreadsheetTimeZone();
    var sheetJobs = [];
    if (lastRow >= 2) {
      var vals = sheet.getRange(2, 1, lastRow - 1, width).getValues();
      var disp = sheet.getRange(2, 1, lastRow - 1, width).getDisplayValues();
      for (var i = 0; i < vals.length; i++) {
        var v = vals[i][col["JobID"] - 1];
        if (v !== "" && v !== null) existing[String(v)] = true;
        sheetJobs.push({
          row: i + 2,
          key: empKey(disp[i][col["Employé"] - 1], disp[i][col["Courriel"] - 1]) + "|" + dateKey(vals[i][col["Date"] - 1], tz),
          depart: parseHM(disp[i][col["Départ"] - 1]),
          id: String(v == null ? "" : v),
          unpaid: Number(vals[i][col["Trajet non payé (min)"] - 1]) || 0,
          heures: disp[i][col["Heures"] - 1],
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
              if (sheetJobs[c].row) clears.push({ row: sheetJobs[c].row, heures: sheetJobs[c].heures });
              else { // earlier row of this same batch, not written yet
                out[sheetJobs[c].outIdx][col["Trajet non payé (min)"] - 1] = 0;
                out[sheetJobs[c].outIdx][col["Heures payées"] - 1] = out[sheetJobs[c].outIdx][col["Heures"] - 1];
              }
              sheetJobs[c].unpaid = 0;
            }
          }
        }
      }
      me.unpaid = unpaid;
      me.outIdx = out.length;
      sheetJobs.push(me);
      out.push(rowFrom(row, toWrite[k].jobId, unpaid, col, width));
    }

    if (out.length > 0) {
      var startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, out.length, width).setValues(out);
      for (var x = 0; x < clears.length; x++) {
        sheet.getRange(clears[x].row, col["Trajet non payé (min)"]).setValue(0);
        sheet.getRange(clears[x].row, col["Heures payées"]).setValue(clears[x].heures);
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

// Finds each expected header in row 1 (accents, case and spaces ignored) and adds the
// missing ones at the end of the row. Returns { "Date": 1, "Employé": 2, ... }.
function ensureHeaders(sheet) {
  var lastCol = sheet.getLastColumn();
  var header = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0] : [];
  var found = {};
  for (var i = 0; i < header.length; i++) {
    var name = normHeader(header[i]);
    if (name && !(name in found)) found[name] = i + 1;
  }
  var col = {};
  var next = header.length;
  // A brand-new sheet (empty row 1) gets the full header in the COLUMNS order.
  if (!Object.keys(found).length) next = 0;
  for (var c = 0; c < COLUMNS.length; c++) {
    var label = COLUMNS[c][0];
    var at = found[normHeader(label)];
    if (!at) {
      next += 1;
      at = next;
      sheet.getRange(1, at).setValue(label);
    }
    col[label] = at;
  }
  return col;
}

// "Approuvé  Le" -> "approuve le"
function normHeader(v) {
  return String(v == null ? "" : v)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

function maxCol(col) {
  var max = 0;
  for (var k in col) if (col[k] > max) max = col[k];
  return max;
}

// One sheet row (`width` cells): each value under its header, other cells left empty.
function rowFrom(d, jobId, unpaid, col, width) {
  var cells = [];
  for (var i = 0; i < width; i++) cells.push("");
  var values = { _unpaid: unpaid, _paid: paidHours(d.heures, unpaid), job_id: jobId };
  for (var c = 0; c < COLUMNS.length; c++) {
    var field = COLUMNS[c][1];
    var value = field in values ? values[field] : d[field];
    cells[col[COLUMNS[c][0]] - 1] = value == null ? "" : value;
  }
  return cells;
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
