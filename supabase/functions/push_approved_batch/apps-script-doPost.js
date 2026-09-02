// Paste this into your Google Apps Script project, overwriting your current
// doPost(). It accepts BOTH shapes:
//
//   - Single row (legacy, from push_approved_to_sheet):
//       { token, job_id, job_date, employee_name, ..., approved_at, approved_by }
//
//   - Batch (from push_approved_batch):
//       { token, rows: [ { job_id, job_date, employee_name, ... }, ... ] }
//
// COLUMN LAYOUT written to "Feuille 1":
//   A Date · B Employé · C Courriel · D Téléphone · E OT · F Départ ·
//   G Arrivée · H Fin · I Heures · J KM · K Approuvé par · L Approuvé le ·
//   M JobID  (dedup key — you can hide this column)
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

var JOB_ID_COL = 13; // column M

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

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Feuille 1");
    if (!sheet) {
      return jsonOut({ success: false, error: "Sheet not found" });
    }

    var inputRows = Array.isArray(data.rows) ? data.rows : [data];

    // job_ids already in the sheet (column M).
    var existing = {};
    var lastRow = sheet.getLastRow();
    if (lastRow >= 1) {
      var ids = sheet.getRange(1, JOB_ID_COL, lastRow, 1).getValues();
      for (var i = 0; i < ids.length; i++) {
        var v = ids[i][0];
        if (v !== "" && v !== null) existing[String(v)] = true;
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

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
