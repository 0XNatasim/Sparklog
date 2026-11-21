// The « fiche » of an overtime proof: the job it belongs to (Départ → Arrivée → Fin → Retour, kilometres) and what the reader
// found against what the timesheet says. Shown in the OCR preview and drawn next to the picture in the downloaded image.
const hhmm = (value) => String(value || "").slice(0, 5) || "—";
const mins = (value) => (value == null ? "—" : `${value} min`);
const num = (value) => (value == null || value === "" ? null : Number(value));

// Is there a return to show? Only when it was declared: minutes or kilometres.
export function hasReturn(job) {
  return Boolean(job) && (Number(job.return_time_minutes) > 0 || Number(job.km_retour) > 0);
}

// Kilometres: the out / return split when the job has it, and the total (km_total, else the sum).
export function jobKilometres(job) {
  const out = num(job?.km_aller);
  const back = num(job?.km_retour);
  const total = num(job?.km_total) ?? (out == null && back == null ? null : (out || 0) + (back || 0));
  return { out, back, total };
}

// Lines of the sheet: [{ key, label, value, bad }]. `t` = the translator.
export function proofSheetLines(row, t) {
  const job = row?.job;
  if (!job) return [];
  const km = jobKilometres(job);
  const lines = [
    { key: "ot", label: t("ocr.col.jobOt"), value: job.ot || "—" },
    { key: "status", label: t("ocr.preview.status"), value: t(`status.${job.status}`) },
    { key: "hours", label: t("ocr.preview.hours"), value: `${hhmm(job.depart)} → ${hhmm(job.arrivee)} → ${hhmm(job.fin)}` },
  ];
  // Why the minutes at the client are what they are: when the day began, and when the line (8 h / 10 h) was reached.
  if (row.expected?.dayStart) lines.push({ key: "dayStart", label: t("ocr.sheet.dayStart"), value: row.expected.dayStart });
  if (row.expected?.lineAt) lines.push({ key: "lineAt", label: t("ocr.sheet.lineAt", { hours: Math.round((row.expected.lineMinutes || 480) / 60) }), value: row.expected.lineAt });
  if (row.notNeeded) lines.push({ key: "notNeeded", label: t("ocr.notNeeded"), value: t("ocr.sheet.notNeededValue") });
  if (hasReturn(job)) lines.push({ key: "return", label: t("ocr.preview.return"), value: mins(num(job.return_time_minutes)) });
  const kmValue = km.total == null ? "—" : `${km.total} km`;
  lines.push({ key: "km", label: t("ocr.preview.km"), value: kmValue });
  if (km.out != null && km.out > 0) lines.push({ key: "kmOut", label: t("ocr.sheet.kmOut"), value: `${km.out} km` });
  if (hasReturn(job) && km.back != null) lines.push({ key: "kmBack", label: t("ocr.sheet.kmBack"), value: `${km.back} km` });
  return lines;
}

// What the reader found against the timesheet: [{ key, label, value, bad }].
export function proofCompareLines(row, t) {
  const job = row?.job;
  if (!job) return [];
  return [
    { key: "cmpOt", label: t("ocr.col.otRead"), value: `${row.found.ot ?? "—"} / ${job.ot || "—"}`, bad: row.wrong.has("ot") },
    { key: "cmpClient", label: t("ocr.preview.clientLine"), value: `${mins(row.found.clientMinutes)} / ${mins(row.expected?.clientMinutes)}`, bad: row.wrong.has("client") },
    { key: "cmpReturn", label: t("ocr.preview.returnLine"), value: `${mins(row.found.returnMinutes)} / ${mins(row.expected?.returnMinutes)}`, bad: row.wrong.has("return") },
  ];
}

// The picture and its sheet drawn side by side (what the preview shows), as a JPEG. Browser only (canvas).
export async function renderProofSheet(blob, { title, subtitle, sections, noJob }) {
  const bitmap = await createImageBitmap(blob);
  const PAD = 28;
  const PANEL = 640;
  const ROW = 46;
  const scale = Math.min(1, 1000 / bitmap.width, 1600 / bitmap.height);
  const imgW = Math.round(bitmap.width * scale);
  const imgH = Math.round(bitmap.height * scale);
  const rowCount = sections.reduce((sum, section) => sum + 1 + section.lines.length, 0) + (noJob ? 1 : 0);
  const panelH = 110 + rowCount * ROW + sections.length * 24;
  const canvas = document.createElement("canvas");
  canvas.width = imgW + PANEL + PAD * 3;
  canvas.height = Math.max(imgH, panelH) + PAD * 2;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, PAD, PAD, imgW, imgH);
  ctx.strokeStyle = "#d4d4d8";
  ctx.strokeRect(PAD, PAD, imgW, imgH);
  const x = imgW + PAD * 2;
  let y = PAD + 36;
  ctx.fillStyle = "#111827";
  ctx.font = "bold 34px sans-serif";
  ctx.fillText(title, x, y);
  y += 36;
  ctx.fillStyle = "#52525b";
  ctx.font = "24px sans-serif";
  ctx.fillText(subtitle, x, y);
  y += 24;
  if (noJob) {
    y += ROW;
    ctx.fillStyle = "#b91c1c";
    ctx.fillText(noJob, x, y);
  }
  for (const section of sections) {
    y += 40;
    ctx.fillStyle = "#111827";
    ctx.font = "bold 26px sans-serif";
    ctx.fillText(section.title, x, y);
    for (const line of section.lines) {
      y += ROW;
      ctx.font = "24px sans-serif";
      ctx.fillStyle = "#52525b";
      ctx.textAlign = "left";
      ctx.fillText(line.label, x, y);
      ctx.font = line.bad ? "bold 24px sans-serif" : "24px sans-serif";
      ctx.fillStyle = line.bad ? "#b91c1c" : "#111827";
      ctx.textAlign = "right";
      ctx.fillText(line.value, x + PANEL, y);
      ctx.textAlign = "left";
      ctx.strokeStyle = "#e4e4e7";
      ctx.beginPath();
      ctx.moveTo(x, y + 12);
      ctx.lineTo(x + PANEL, y + 12);
      ctx.stroke();
    }
  }
  const out = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
  if (!out) throw new Error("sheet render failed");
  return new Uint8Array(await out.arrayBuffer());
}
