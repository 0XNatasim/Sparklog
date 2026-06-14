// Paste this into your Google Apps Script project, overwriting your current
// doPost(). It accepts BOTH shapes:
//
//   - Single row (legacy, from push_approved_to_sheet):
//       { token, job_date, employee_name, ..., approved_at, approved_by }
//
//   - Batch (new, from push_approved_batch):
//       { token, rows: [ { job_date, employee_name, ... }, ... ] }
//
// After saving, do Deploy -> Manage deployments -> Edit -> New version ->
// Deploy. Otherwise the web app keeps serving the old code.

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    const expected = PropertiesService.getScriptProperties().getProperty("TOKEN");
    if (!expected || data.token !== expected) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: false, error: "Unauthorized" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet()
      .getSheetByName("Feuille 1");
    if (!sheet) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: false, error: "Sheet not found" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Build a 2D array of rows in the column order the sheet expects:
    // A=Date, B=Employee, C=Email, D=Phone, E=OT, F=Depart, G=Arrival,
    // H=End, I=Heures, J=KM, K=Approved by, L=Approved at
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
        d.approved_by,
        d.approved_at,
      ];
    }

    const inputRows = Array.isArray(data.rows) ? data.rows : [data];
    const values = inputRows.map(rowFrom);

    if (values.length === 0) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: true, written: 0 }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Single bulk write — one Sheet API call regardless of batch size
    const startRow = sheet.getLastRow() + 1;
    sheet
      .getRange(startRow, 1, values.length, values[0].length)
      .setValues(values);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, written: values.length }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
