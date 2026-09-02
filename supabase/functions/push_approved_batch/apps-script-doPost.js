// Paste this into your Google Apps Script project, overwriting your current
// doPost(). It accepts BOTH shapes:
//
//   - Single row (legacy, from push_approved_to_sheet):
//       { token, job_id, job_date, employee_name, ..., approved_at, approved_by }
//
//   - Batch (new, from push_approved_batch):
//       { token, rows: [ { job_id, job_date, employee_name, ... }, ... ] }
//
// IDEMPOTENCY: each row carries a job_id. We store it in a hidden column (O)
// and skip any row whose job_id is already in the sheet. This makes posting the
// same job twice a no-op — so a retry, a double-click, or two managers exporting
// at once can never create duplicate rows. A ScriptLock serializes concurrent
// posts so the "read existing ids → append new ones" step is race-free.
//
// After saving, do Deploy -> Manage deployments -> Edit -> New version ->
// Deploy. Otherwise the web app keeps serving the old code.

// Column that stores job_id for dedup (O = 15). Columns A–N hold the visible
// data; O is written alongside and can be hidden in the sheet if you like.
var JOB_ID_COL = 15;

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    // Wait up to 30s for any in-flight post to finish before we read/append.
    lock.waitLock(30000);
  } catch (lockErr) {
    return jsonOut({ success: false, error: "Busy — another export is running, please retry" });
  }

  try {
    var data = JSON.parse(e.postData.contents);

    var expected = PropertiesService.getScriptProperties().getProperty("TOKEN");
    if (!expected || data.token !== expected) {
      return jsonOut({ success: false, error: "Unauthorized" });
    }

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Feuille 1");
    if (!sheet) {
      return jsonOut({ success: false, error: "Sheet not found" });
    }

    var inputRows = Array.isArray(data.rows) ? data.rows : [data];

    // Collect job_ids already present in the sheet (column O).
    var existing = {};
    var lastRow = sheet.getLastRow();
    if (lastRow >= 1) {
      var ids = sheet.getRange(1, JOB_ID_COL, lastRow, 1).getValues();
      for (var i = 0; i < ids.length; i++) {
        var v = ids[i][0];
        if (v !== "" && v !== null) existing[String(v)] = true;
      }
    }

    // Keep only rows whose job_id we haven't written yet (dedup within the
    // incoming batch too).
    var toWrite = [];
    var skippedIds = [];
    for (var j = 0; j < inputRows.length; j++) {
      var d = inputRows[j];
      var jobId = d.job_id != null ? String(d.job_id) : "";
      if (jobId && existing[jobId]) { skippedIds.push(jobId); continue; }
      if (jobId) existing[jobId] = true;
      toWrite.push(rowFrom(d).concat([jobId]));
    }

    if (toWrite.length > 0) {
      var startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, toWrite.length, toWrite[0].length).setValues(toWrite);
    }

    return jsonOut({
      success: true,
      written: toWrite.length,
      skipped: skippedIds.length,
      skipped_ids: skippedIds,
    });
  } catch (err) {
    return jsonOut({ success: false, error: err.message });
  } finally {
    lock.releaseLock();
  }
}

// Build one visible row (columns A–N) in the order the sheet expects:
// A=Date, B=Employee, C=Email, D=Phone, E=OT, F=Depart, G=Arrival,
// H=End, I=Heures, J=KM aller, K=Temps retour (min), L=KM retour,
// M=Approved by, N=Approved at. (Column O = job_id is appended by the caller.)
function rowFrom(d) {
  return [
    d.job_date,
    d.employee_name,
    d.employee_email,
    d.employee_phone,
    d.ot,
    d.depart,
    d.arrivee,
    d.fin,
    d.heures,
    d.km_aller,
    d.return_time_minutes,
    d.km_retour,
    d.approved_by,
    d.approved_at,
  ];
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
