// Annual rotation of the payroll Google Sheet (V2.4.227). Paste into the Apps Script project bound to the
// CURRENT year's sheet, reload the sheet, then use the menu « Sparklog › Préparer le Sheet de l'année suivante ».
//
// What it does (the current sheet is NEVER modified or deleted):
//   1. makes a copy of the whole spreadsheet, named « <current name sans année> <next year> »;
//   2. in the COPY only: keeps row 1 (the headers) of « Data » and removes every other row, and deletes the
//      weekly tabs « SemXX » (Feuille3 / Stats recreates them from the new year's data);
//   3. shows the copy's address.
//
// What it CANNOT copy (do these by hand afterwards, see NOOB.md « Nouveau Google Sheet de l'année »):
//   - the script property TOKEN (Project Settings › Script properties): set the SAME value as APPS_SCRIPT_TOKEN
//     in Supabase, or a new one in both places;
//   - the web-app deployment: Deploy › New deployment › Web app (Execute as: me, Access: anyone) → new /exec URL
//     to put in the Supabase secret APPS_SCRIPT_URL.
//
// Until APPS_SCRIPT_URL points to the new sheet, exports keep going to the old one.

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Sparklog")
    .addItem("Préparer le Sheet de l'année suivante", "rotateToNewYear")
    .addToUi();
}

function rotateToNewYear() {
  var ui = SpreadsheetApp.getUi();
  var source = SpreadsheetApp.getActiveSpreadsheet();
  var nextYear = new Date().getFullYear() + 1;
  var baseName = source.getName().replace(/\s*(19|20)\d{2}\s*$/, "").trim();
  var newName = baseName + " " + nextYear;

  var answer = ui.alert(
    "Créer « " + newName + " » ?",
    "Une copie sera créée avec les en-têtes seulement (sans fiches ni onglets de semaine). Le Sheet actuel n'est pas touché.",
    ui.ButtonSet.OK_CANCEL
  );
  if (answer !== ui.Button.OK) return;

  var copyFile = DriveApp.getFileById(source.getId()).makeCopy(newName);
  var copy = SpreadsheetApp.openById(copyFile.getId());

  var data = copy.getSheetByName("Data") || copy.getSheetByName("Feuille 1");
  if (!data) {
    ui.alert("Onglet « Data » introuvable dans la copie : rien n'a été vidé. Copie créée : " + copy.getUrl());
    return;
  }
  var lastRow = data.getLastRow();
  if (lastRow > 2) data.deleteRows(3, lastRow - 2); // keep headers and one row so the sheet stays valid
  if (lastRow >= 2) data.getRange(2, 1, 1, Math.max(data.getLastColumn(), 1)).clearContent();

  var removed = 0;
  copy.getSheets().forEach(function (sheet) {
    if (/^Sem\d+$/.test(sheet.getName())) {
      copy.deleteSheet(sheet);
      removed++;
    }
  });

  ui.alert(
    "Copie prête : " + newName,
    "Onglets de semaine retirés : " + removed + ".\n\nAdresse : " + copy.getUrl() +
      "\n\nReste à faire dans la copie : propriété TOKEN, nouveau déploiement Web, puis APPS_SCRIPT_URL dans Supabase.",
    ui.ButtonSet.OK
  );
}
