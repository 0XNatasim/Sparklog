// ─────────────────────────────────────────────────────────────────────────────
// Sparklog — onglet « Stats » : tableau de bord professionnel des heures approuvées
//
// Ce script LIT l’onglet master « Data » (jamais modifié) et génère l’onglet « Stats » :
//   01 Indicateurs clés     — heures, jobs, KM, ratios route / terrain, alertes
//   02 Graphiques           — heures par employé, heures par semaine CCQ
//   03 Classement           — rang des employés + ratios d’efficacité
//   04 Semaines CCQ         — carte de chaleur dimanche → samedi, seuil 40 h
//   05 Contrôle qualité     — chevauchements, doublons, vitesses, route sans KM…
//   06 Explorateur          — recherche par employé, dates, mot-clé, alertes
// Il crée aussi un onglet par semaine CCQ (« Sem37 », « Sem38 »…) : résumé par
// employé et par jour + détail des jobs, prêt à exporter (Fichier → Télécharger).
// « Data » reste le master et n’est jamais modifié. Les onglets SemXX sont
// régénérés : corrigez les données dans Data.
//
// INSTALLATION (une seule fois) :
//   1. Dans le Google Sheet : Extensions → Apps Script.
//   2. Fichiers « + » → Script → nommez-le « Feuille3 » et collez ce fichier.
//      (Ne remplacez PAS le fichier qui contient doPost.)
//   3. Choisissez la fonction « F3_installer » dans la liste, puis ▶ Exécuter,
//      et acceptez les autorisations.
// Ensuite : le menu « 📊 Sparklog » apparaît à l’ouverture du fichier et la
// l’onglet Stats se met à jour toute seule toutes les 15 minutes (seulement si la
// Data a changé). Les filtres de l’explorateur sont conservés.
// ─────────────────────────────────────────────────────────────────────────────

const F3 = {
  VERSION: '1.1.0',
  SOURCE: 'Data',
  SOURCE_ALIASES: ['Data', 'Feuille 1'],   // anciens noms acceptés pour l’onglet master
  TARGET: 'Stats',
  LEGACY_TARGET: 'Feuille 3',   // ancien nom : renommé automatiquement en « Stats »
  FONT: 'Roboto',
  DATA_COL: 27,        // AA : registre normalisé (masqué) qui alimente l’explorateur
  CHART_COL: 46,       // AT : cellule témoin (syntaxe des formules), masquée
  MAX_ALERTS: 150,
  MAX_WEEKS: 12,
  EMP_COLS: 11,        // colonnes employés dans la carte des semaines (F → P)
  DAILY_REGULAR_MIN: 480,   // 8 h / jour : au-delà = temps supplémentaire (indicatif)
  WEEKLY_LIMIT_MIN: 2400,   // 40 h / semaine
  LONG_JOB_MIN: 600,        // job > 10 h
  LONG_DAY_MIN: 720,        // journée > 12 h
  MAX_SPEED_KMH: 110,
  // B → Q (16 colonnes de contenu), A et R servent de marges.
  WIDTHS: [95, 60, 70, 185, 90, 65, 65, 65, 72, 72, 72, 62, 72, 230, 115, 105],
  C: {
    ink: '#0F172A', text: '#1E293B', muted: '#64748B', faint: '#94A3B8',
    line: '#E2E8F0', panel: '#F8FAFC', head: '#F1F5F9',
    navy: '#0B1220', navy2: '#1E293B',
    blue: '#2563EB', blueSoft: '#EFF6FF', blueLine: '#93C5FD',
    green: '#059669', greenSoft: '#ECFDF5',
    amber: '#B45309', amberSoft: '#FFFBEB',
    red: '#B91C1C', redSoft: '#FEF2F2',
    violet: '#7C3AED', teal: '#0D9488',
  },
  PALETTE: ['#2563EB', '#0D9488', '#F59E0B', '#7C3AED', '#E11D48', '#0891B2',
            '#65A30D', '#EA580C', '#4F46E5', '#DB2777', '#64748B'],
  JOURS: ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'],
  MOIS: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
};

// ═════════════════════════════════════════════════════════════════════════════
// Points d’entrée
// ═════════════════════════════════════════════════════════════════════════════

/** À exécuter une fois : menu, mise à jour automatique, première génération. */
function F3_installer() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const handlers = ['F3_onOpen', 'F3_actualiserSiChangement'];
  ScriptApp.getProjectTriggers()
    .filter(t => handlers.indexOf(t.getHandlerFunction()) !== -1)
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('F3_onOpen').forSpreadsheet(ss).onOpen().create();
  ScriptApp.newTrigger('F3_actualiserSiChangement').timeBased().everyMinutes(15).create();
  F3_actualiser();
  try { F3_onOpen(); } catch (e) { /* le menu apparaîtra à la prochaine ouverture */ }
  ss.toast('Stats installé : menu 📊 Sparklog + mise à jour toutes les 15 min.', 'Sparklog', 8);
}

/** Déclencheur d’ouverture (installable, n’entre pas en conflit avec un onOpen existant). */
function F3_onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📊 Sparklog')
    .addItem('Actualiser Stats et les semaines', 'F3_actualiser')
    .addItem('Réinitialiser les filtres', 'F3_reinitialiserFiltres')
    .addItem('Recréer tous les onglets de semaine', 'F3_recreerSemaines')
    .addSeparator()
    .addItem('Aller à Stats', 'F3_ouvrir')
    .addToUi();
}

function F3_ouvrir() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(F3.TARGET);
  if (sh) sh.activate();
}

/** Reconstruit l’onglet Stats à partir de l’onglet Data. */
function F3_actualiser() {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) return;
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const source = F3_readSource_(ss);
    const model = F3_buildModel_(source.rows, source.skipped);
    F3_render_(ss, model);
    F3_syncWeekTabs_(ss, model, false);
    PropertiesService.getDocumentProperties().setProperty('F3_FINGERPRINT', source.fingerprint);
  } finally {
    lock.releaseLock();
  }
}

/** Déclencheur minuté : ne reconstruit que si l’onglet Data a changé. */
function F3_actualiserSiChangement() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const props = PropertiesService.getDocumentProperties();
  const src = F3_sourceSheet_(ss);
  if (!src) return;
  const fp = F3_fingerprint_(src.getDataRange().getDisplayValues());
  if (ss.getSheetByName(F3.TARGET) && props.getProperty('F3_FINGERPRINT') === fp) return;
  F3_actualiser();
}

/** Force la régénération de tous les onglets SemXX. */
function F3_recreerSemaines() {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) return;
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const source = F3_readSource_(ss);
    F3_syncWeekTabs_(ss, F3_buildModel_(source.rows, source.skipped), true);
  } finally {
    lock.releaseLock();
  }
}

function F3_reinitialiserFiltres() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(F3.TARGET);
  const row = Number(PropertiesService.getDocumentProperties().getProperty('F3_FILTER_ROW'));
  if (!sh || !row) return;
  sh.getRange(row, 3).setValue('Tous');
  sh.getRange(row, 7).clearContent();
  sh.getRange(row, 10).clearContent();
  sh.getRange(row, 13).clearContent();
  sh.getRange(row, 17).setValue(false);
  sh.activate();
  sh.setActiveRange(sh.getRange(row, 3));
}

// ═════════════════════════════════════════════════════════════════════════════
// Lecture et normalisation (onglet Data en lecture seule)
// ═════════════════════════════════════════════════════════════════════════════

function F3_fingerprint_(display) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5,
    F3.VERSION + JSON.stringify(display), Utilities.Charset.UTF_8);
  return Utilities.base64Encode(bytes);
}

/** L’onglet master : « Data » (ou « Feuille 1 »), sinon le premier onglet dont l’en-tête contient JobID. */
function F3_sourceSheet_(ss) {
  for (const name of F3.SOURCE_ALIASES) {
    const sh = ss.getSheetByName(name);
    if (sh) return sh;
  }
  return ss.getSheets().find(sh => {
    if (sh.getLastRow() < 1 || sh.getLastColumn() < 1) return false;
    return sh.getRange(1, 1, 1, Math.min(sh.getLastColumn(), 20)).getDisplayValues()[0]
      .some(h => F3_norm_(h) === 'jobid');
  }) || null;
}

function F3_readSource_(ss) {
  const sh = F3_sourceSheet_(ss);
  if (!sh) throw new Error('Onglet master introuvable : nommez-le « ' + F3.SOURCE + ' ».');
  const range = sh.getDataRange();
  const values = range.getValues();
  const display = range.getDisplayValues();
  const tz = ss.getSpreadsheetTimeZone();
  const fmtDate = d => Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  const parsed = F3_parseRows_(values, display, fmtDate);
  parsed.fingerprint = F3_fingerprint_(display);
  return parsed;
}

function F3_norm_(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Repère les colonnes par leur titre (repli sur la disposition A → M du doPost). */
function F3_columns_(header) {
  const want = {
    date: ['date'], employe: ['employe', 'employee'], courriel: ['courriel', 'email'],
    tel: ['telephone', 'tel', 'phone'],
    ot: ['ot'], depart: ['depart'], arrivee: ['arrivee'], fin: ['fin'], km: ['km'],
    par: ['approuve par'], le: ['approuve le'], id: ['jobid', 'job id'],
  };
  const fallback = { date: 0, employe: 1, courriel: 2, tel: 3, ot: 4, depart: 5, arrivee: 6, fin: 7,
                     km: 9, par: 10, le: 11, id: 12 };
  const normed = header.map(F3_norm_);
  const cols = {};
  Object.keys(want).forEach(k => {
    const idx = normed.findIndex(h => want[k].indexOf(h) !== -1);
    cols[k] = idx !== -1 ? idx : fallback[k];
  });
  return cols;
}

function F3_parseDate_(value, text, fmtDate) {
  if (value instanceof Date && !isNaN(value)) {
    const p = fmtDate(value).split('-').map(Number);
    return { y: p[0], m: p[1], d: p[2] };
  }
  if (typeof value === 'number' && value > 20000 && value < 80000) {
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
  }
  const s = String(text || value || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return { y: +m[1], m: +m[2], d: +m[3] };
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return { y: +m[3], m: +m[2], d: +m[1] };
  return null;
}

function F3_parseTime_(text) {
  const m = String(text || '').match(/(\d{1,2})\s*[:hH]\s*(\d{2})/);
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

function F3_parseKm_(value, text) {
  if (typeof value === 'number' && isFinite(value)) return value;
  const n = parseFloat(String(text || '').replace(/\s/g, '').replace(',', '.'));
  return isFinite(n) ? n : 0;
}

function F3_titleCase_(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase()
    .replace(/(^|[\s\-'’])(\p{L})/gu, (all, sep, ch) => sep + ch.toUpperCase());
}

function F3_serial_(y, m, d) {
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
}

/** Semaine CCQ : dimanche → samedi, n° selon le calendrier CCQ (cf. src/lib/ccq-week.js). */
function F3_ccqWeek_(y, m, d) {
  const DAY = 86400000;
  const t = Date.UTC(y, m - 1, d);
  const dow = new Date(t).getUTCDay();
  const end = t + ((6 - dow + 7) % 7) * DAY;
  const lastSatOfDec = yr => {
    const dec31 = Date.UTC(yr, 11, 31);
    return dec31 - ((new Date(dec31).getUTCDay() - 6 + 7) % 7) * DAY;
  };
  let year = new Date(end).getUTCFullYear() + 1;
  while (lastSatOfDec(year - 1) > end) year -= 1;
  const no = Math.round((end - lastSatOfDec(year - 1)) / (7 * DAY)) + 1;
  const start = new Date(end - 6 * DAY);
  const endD = new Date(end);
  return {
    key: year + '-' + String(no).padStart(2, '0'),
    no: no, year: year,
    startSerial: F3_serial_(start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate()),
    label: 'S' + no + ' · ' + start.getUTCDate() + ' ' + F3.MOIS[start.getUTCMonth()] +
           ' → ' + endD.getUTCDate() + ' ' + F3.MOIS[endD.getUTCMonth()],
  };
}

function F3_parseRows_(values, display, fmtDate) {
  const rows = [];
  let skipped = 0;
  if (!values.length) return { rows: rows, skipped: skipped };
  const c = F3_columns_(display[0]);
  for (let r = 1; r < values.length; r++) {
    const v = values[r], t = display[r];
    if (t.every(x => String(x).trim() === '')) continue;
    const date = F3_parseDate_(v[c.date], t[c.date], fmtDate);
    const name = String(t[c.employe] || '').trim();
    const dep = F3_parseTime_(t[c.depart]);
    let fin = F3_parseTime_(t[c.fin]);
    if (!date || !name) { skipped++; continue; }
    let arr = F3_parseTime_(t[c.arrivee]);
    if (dep !== null && fin !== null && fin <= dep) fin += 1440;      // job de nuit
    if (dep !== null && arr !== null && arr < dep) arr += 1440;
    rows.push({
      date: date,
      serial: F3_serial_(date.y, date.m, date.d),
      dateKey: date.y + '-' + String(date.m).padStart(2, '0') + '-' + String(date.d).padStart(2, '0'),
      empKey: F3_norm_(t[c.courriel]) || F3_norm_(name),
      rawName: name,
      ot: String(t[c.ot] || '').trim(),
      dep: dep, arr: arr, fin: fin,
      km: F3_parseKm_(v[c.km], t[c.km]),
      par: String(t[c.par] || '').trim(),
      le: String(t[c.le] || '').trim(),
      id: String(t[c.id] || '').trim(),
      email: String(t[c.courriel] || '').trim(),
      tel: String(t[c.tel] || '').trim(),
      sourceRow: r + 1,
    });
  }
  return { rows: rows, skipped: skipped };
}

// ═════════════════════════════════════════════════════════════════════════════
// Modèle : ratios, classement, semaines, alertes
// ═════════════════════════════════════════════════════════════════════════════

function F3_buildModel_(rows, skipped) {
  const emps = new Map();
  const days = new Map();
  const weeks = new Map();
  const dupes = new Map();

  const jobs = rows.map(r => {
    const valid = r.dep !== null && r.fin !== null;
    const total = valid ? r.fin - r.dep : 0;
    const arrOk = valid && r.arr !== null && r.arr >= r.dep && r.arr <= r.fin;
    const route = arrOk ? r.arr - r.dep : 0;
    const d = new Date(Date.UTC(r.date.y, r.date.m - 1, r.date.d));
    const job = Object.assign({}, r, {
      valid: valid, arrOk: arrOk, total: total, route: route,
      onsite: arrOk ? r.fin - r.arr : total,
      dow: d.getUTCDay(),
      week: F3_ccqWeek_(r.date.y, r.date.m, r.date.d),
      alerts: [], sev: 0,
    });

    if (!emps.has(r.empKey)) {
      emps.set(r.empKey, { key: r.empKey, name: '', lastSerial: -1, jobs: 0, days: new Set(),
        total: 0, route: 0, routeBase: 0, km: 0, otMin: 0, alerts: 0 });
    }
    const e = emps.get(r.empKey);
    if (job.serial >= e.lastSerial) { e.lastSerial = job.serial; e.name = F3_titleCase_(r.rawName); }
    e.jobs++; e.days.add(r.dateKey); e.total += total; e.km += r.km;
    if (arrOk) { e.route += route; e.routeBase += total; }

    const dk = r.empKey + '|' + r.dateKey;
    if (!days.has(dk)) days.set(dk, { empKey: r.empKey, total: 0, jobs: [] });
    days.get(dk).total += total;
    days.get(dk).jobs.push(job);

    const wk = job.week.key;
    if (!weeks.has(wk)) weeks.set(wk, { week: job.week, total: 0, jobs: 0, byEmp: new Map() });
    const w = weeks.get(wk);
    w.total += total; w.jobs++;
    w.byEmp.set(r.empKey, (w.byEmp.get(r.empKey) || 0) + total);

    const dupKey = [r.empKey, r.dateKey, r.ot, r.dep, r.fin].join('|');
    if (!dupes.has(dupKey)) dupes.set(dupKey, []);
    dupes.get(dupKey).push(job);
    return job;
  });

  const flag = (job, sev, msg) => {
    if (job.alerts.indexOf(msg) === -1) job.alerts.push(msg);
    job.sev = Math.max(job.sev, sev);
  };
  const hm = F3_fmtHM_;

  // Règles par job
  jobs.forEach(j => {
    if (!j.valid) { flag(j, 3, '🔴 Heures manquantes'); return; }
    if (j.arr !== null && !j.arrOk) flag(j, 3, '🔴 Arrivée hors intervalle');
    if (j.total > F3.LONG_JOB_MIN) flag(j, 2, '🟠 Job > ' + hm(F3.LONG_JOB_MIN));
    const speed = j.route > 0 ? j.km / (j.route / 60) : 0;
    if (speed > F3.MAX_SPEED_KMH) flag(j, 2, '🟠 Vitesse ' + Math.round(speed) + ' km/h');
    if (j.route >= 30 && j.km === 0) flag(j, 1, '🟡 Route sans KM');
    if (j.km >= 20 && j.arrOk && j.route === 0) flag(j, 1, '🟡 KM sans route');
    if (j.arrOk && j.total >= 30 && j.route / j.total > 0.5) {
      flag(j, 1, '🟡 Route ' + Math.round(100 * j.route / j.total) + ' % du job');
    }
  });

  // Règles par journée : chevauchements, journée longue, temps supplémentaire
  days.forEach(day => {
    const list = day.jobs.filter(j => j.valid).sort((a, b) => a.dep - b.dep);
    for (let i = 0; i < list.length; i++) {
      for (let k = i + 1; k < list.length && list[k].dep < list[i].fin; k++) {
        flag(list[i], 3, '🔴 Chevauche OT ' + (list[k].ot || '?'));
        flag(list[k], 3, '🔴 Chevauche OT ' + (list[i].ot || '?'));
      }
    }
    if (day.total > F3.LONG_DAY_MIN) day.jobs.forEach(j => flag(j, 2, '🟠 Journée ' + hm(day.total)));
    emps.get(day.empKey).otMin += Math.max(0, day.total - F3.DAILY_REGULAR_MIN);
  });

  dupes.forEach(list => {
    if (list.length > 1) list.forEach(j => flag(j, 3, '🔴 Doublon possible'));
  });

  const rank = msg => ['🔴', '🟠', '🟡'].findIndex(icon => msg.indexOf(icon) === 0);
  jobs.forEach(j => {
    j.alerts.sort((a, b) => rank(a) - rank(b));
    if (j.alerts.length) emps.get(j.empKey).alerts++;
  });

  // Agrégats globaux
  const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
  const empList = Array.from(emps.values()).map(e => Object.assign(e, {
    dayCount: e.days.size,
    routePct: e.routeBase ? e.route / e.routeBase : 0,
  })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  const totalMin = sum(jobs, j => j.total);
  const routeMin = sum(jobs.filter(j => j.arrOk), j => j.route);
  const routeBase = sum(jobs.filter(j => j.arrOk), j => j.total);
  const personDays = days.size;
  const serials = jobs.map(j => j.serial);

  const weekList = Array.from(weeks.values()).sort((a, b) => a.week.startSerial - b.week.startSerial);
  weekList.forEach((w, i) => {
    w.delta = i > 0 && weekList[i - 1].total ? (w.total - weekList[i - 1].total) / weekList[i - 1].total : null;
  });

  const alertJobs = jobs.filter(j => j.alerts.length)
    .sort((a, b) => b.sev - a.sev || b.serial - a.serial || (a.dep || 0) - (b.dep || 0));

  return {
    jobs: jobs,
    emps: empList,
    weeks: weekList,
    alertJobs: alertJobs,
    skipped: skipped,
    kpi: {
      totalMin: totalMin,
      jobs: jobs.length,
      emps: empList.length,
      personDays: personDays,
      km: sum(jobs, j => j.km),
      firstSerial: serials.length ? Math.min.apply(null, serials) : null,
      lastSerial: serials.length ? Math.max.apply(null, serials) : null,
      avgJob: jobs.length ? totalMin / jobs.length : 0,
      avgDay: personDays ? totalMin / personDays : 0,
      routePct: routeBase ? routeMin / routeBase : 0,
      otMin: sum(empList, e => e.otMin),
      alerts: alertJobs.length,
      critical: alertJobs.filter(j => j.sev === 3).length,
      kmPerJob: jobs.length ? sum(jobs, j => j.km) / jobs.length : 0,
    },
  };
}

function F3_fmtHM_(min) {
  const m = Math.round(min);
  return Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0');
}

function F3_fmtSerial_(serial) {
  const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
  return d.getUTCDate() + ' ' + F3.MOIS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
}

function F3_shortName_(name) {
  const parts = String(name).split(' ').filter(Boolean);
  if (parts.length < 2) return name;
  const last = parts[parts.length - 1];
  return parts[0] + ' ' + last.charAt(0).toUpperCase() + '.';
}

// ═════════════════════════════════════════════════════════════════════════════
// Rendu
// ═════════════════════════════════════════════════════════════════════════════

const F3_FMT = {
  dur: '[h]"h"mm',
  time: 'hh:mm',
  date: 'dd/mm/yyyy',
  int: '#,##0',
  km: '#,##0" km"',
  pct: '0%',
  pct1: '0.0%',
};

function F3_render_(ss, model) {
  const C = F3.C;
  let sh = ss.getSheetByName(F3.TARGET);
  const legacy = ss.getSheetByName(F3.LEGACY_TARGET);
  if (!sh && legacy) sh = legacy.setName(F3.TARGET);
  const saved = F3_readFilters_(sh);
  if (!sh) sh = ss.insertSheet(F3.TARGET, ss.getSheets().length);
  F3_reset_(sh);

  const jobsN = model.jobs.length;
  const alertsN = Math.min(model.alertJobs.length, F3.MAX_ALERTS);
  const weeksShown = model.weeks.slice(-F3.MAX_WEEKS).reverse();
  const needRows = 60 + model.emps.length + weeksShown.length + Math.max(alertsN, 1) + Math.max(jobsN, 1) + 20;
  const needCols = F3.CHART_COL + F3.EMP_COLS + 6;
  if (sh.getMaxRows() < needRows) sh.insertRowsAfter(sh.getMaxRows(), needRows - sh.getMaxRows());
  if (sh.getMaxColumns() < needCols) sh.insertColumnsAfter(sh.getMaxColumns(), needCols - sh.getMaxColumns());

  // Toile de fond
  sh.setHiddenGridlines(true);
  sh.setTabColor(C.blue);
  sh.getRange(1, 1, sh.getMaxRows(), 18)
    .setFontFamily(F3.FONT).setFontSize(10).setFontColor(C.text)
    .setVerticalAlignment('middle').setBackground('#FFFFFF');
  sh.setColumnWidth(1, 22);
  F3.WIDTHS.forEach((w, i) => sh.setColumnWidth(i + 2, w));
  sh.setColumnWidth(18, 22);

  F3_writeDataBlock_(sh, model);
  F3_detectFormulaSyntax_(sh);

  let row = 1;
  sh.setRowHeight(row, 14);
  row = F3_renderHeader_(sh, row + 1, model);
  row = F3_renderKpis_(sh, row + 1, model);
  row = F3_renderCharts_(sh, row + 1, model);
  row = F3_renderRanking_(sh, row + 1, model);
  row = F3_renderWeeks_(sh, row + 1, model, weeksShown);
  row = F3_renderAlerts_(sh, row + 1, model, alertsN);
  row = F3_renderExplorer_(sh, row + 1, model, saved);

  // Masque tout ce qui est à droite de la marge R.
  sh.hideColumns(19, sh.getMaxColumns() - 18);
}

function F3_reset_(sh) {
  sh.getCharts().forEach(ch => sh.removeChart(ch));
  sh.getBandings().forEach(b => b.remove());
  sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(p => { try { p.remove(); } catch (e) {} });
  sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(p => { try { p.remove(); } catch (e) {} });
  sh.setFrozenRows(0);
  sh.setFrozenColumns(0);
  if (sh.getFilter()) sh.getFilter().remove();
  sh.showColumns(1, sh.getMaxColumns());
  const all = sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns());
  all.breakApart();
  all.clearDataValidations();
  all.clearNote();
  sh.clearConditionalFormatRules();
  sh.clear();
  sh.setRowHeights(1, sh.getMaxRows(), 21);
}

function F3_readFilters_(sh) {
  const out = { emp: 'Tous', from: '', to: '', q: '', alerts: false };
  const row = Number(PropertiesService.getDocumentProperties().getProperty('F3_FILTER_ROW'));
  if (!sh || !row || row > sh.getMaxRows()) return out;
  try {
    const v = sh.getRange(row, 1, 1, 17).getValues()[0];
    out.emp = v[2] || 'Tous';
    out.from = v[6] instanceof Date ? v[6] : '';
    out.to = v[9] instanceof Date ? v[9] : '';
    out.q = v[12] ? String(v[12]) : '';
    out.alerts = v[16] === true;
  } catch (e) { /* on repart des valeurs par défaut */ }
  return out;
}

// ── Registre masqué (AA → AP) + séries des graphiques ─────────────────────────

const F3_DATA_HEADERS = ['Date', 'Jour', 'Sem.', 'Employé', 'OT', 'Départ', 'Arrivée', 'Fin',
  'Route', 'Sur site', 'Total', 'KM', '% route', 'Alertes', 'Approuvé par', 'JobID'];

function F3_writeDataBlock_(sh, model) {
  const col = F3.DATA_COL;
  const empName = new Map(model.emps.map(e => [e.key, e.name]));
  const rows = model.jobs.map(j => [
    j.serial,
    F3.JOURS[j.dow],
    'S' + j.week.no,
    empName.get(j.empKey),
    j.ot,
    j.dep === null ? '' : j.dep / 1440,
    j.arr === null ? '' : j.arr / 1440,
    j.fin === null ? '' : j.fin / 1440,
    j.route / 1440,
    j.onsite / 1440,
    j.total / 1440,
    j.km,
    j.arrOk && j.total ? j.route / j.total : '',
    j.alerts.join(' · '),
    j.par,
    j.id,
  ]);
  sh.getRange(1, col, 1, 16).setValues([F3_DATA_HEADERS]);
  if (rows.length) sh.getRange(2, col, rows.length, 16).setValues(rows);

  model.dataRows = rows.length;
}

// ── Formules : syntaxe selon la langue du fichier ─────────────────────────────
// En français (virgule décimale), Google Sheets attend « ; » entre les arguments.
// On teste une formule témoin une fois par génération et on adapte toutes les autres.

let F3_SEMICOLON = false;

function F3_detectFormulaSyntax_(sh) {
  const probe = sh.getRange(1, F3.CHART_COL);
  probe.setFormula('=SUM(1,2)');
  SpreadsheetApp.flush();
  F3_SEMICOLON = probe.getValue() !== 3;
  probe.clearContent();
}

/** Écrit la formule (syntaxe anglaise, virgules) dans la syntaxe attendue par le fichier. */
function F3_fx_(formula) {
  if (!F3_SEMICOLON) return formula;
  let out = '', inQuote = false;
  for (const ch of formula) {
    if (ch === '"') inQuote = !inQuote;
    out += (!inQuote && ch === ',') ? ';' : ch;
  }
  return out;
}

// ── Blocs visuels ─────────────────────────────────────────────────────────────

function F3_band_(sh, row, n) {
  return sh.getRange(row, 2, n || 1, 16);
}

function F3_renderHeader_(sh, row, model) {
  const C = F3.C, k = model.kpi;
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const now = Utilities.formatDate(new Date(), tz, "dd/MM/yyyy 'à' HH:mm");
  const period = k.firstSerial === null ? 'Aucune donnée'
    : 'Du ' + F3_fmtSerial_(k.firstSerial) + ' au ' + F3_fmtSerial_(k.lastSerial);

  F3_band_(sh, row, 4).setBackground(C.navy);
  sh.setRowHeight(row, 16);
  sh.getRange(row + 1, 2, 1, 12).merge()
    .setValue('SPARKLOG  ·  Tableau de bord des heures approuvées')
    .setFontSize(20).setFontWeight('bold').setFontColor('#FFFFFF');
  sh.getRange(row + 1, 14, 1, 4).merge()
    .setValue('● À JOUR').setHorizontalAlignment('right')
    .setFontSize(9).setFontWeight('bold').setFontColor('#34D399');
  sh.setRowHeight(row + 1, 42);
  sh.getRange(row + 2, 2, 1, 16).merge()
    .setValue(period + '   ·   ' + k.jobs + ' jobs   ·   ' + k.emps + ' employés   ·   Source : ' +
      F3.SOURCE + '   ·   Actualisé le ' + now)
    .setFontSize(10).setFontColor('#CBD5E1');
  sh.setRowHeight(row + 2, 24);
  sh.setRowHeight(row + 3, 14);
  return row + 4;
}

function F3_sectionTitle_(sh, row, num, title, hint) {
  const C = F3.C;
  sh.setRowHeight(row, 12);
  const r = row + 1;
  sh.getRange(r, 2, 1, 9).merge().setValue(num + '   ' + title.toUpperCase())
    .setFontSize(11).setFontWeight('bold').setFontColor(C.ink);
  sh.getRange(r, 11, 1, 7).merge().setValue(hint || '')
    .setHorizontalAlignment('right').setFontSize(9).setFontStyle('italic').setFontColor(C.muted);
  F3_band_(sh, r).setBorder(null, null, true, null, null, null, C.blue,
    SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sh.setRowHeight(r, 30);
  sh.setRowHeight(r + 1, 8);
  return r + 2;
}

function F3_tableHeader_(sh, row, labels, spans) {
  const C = F3.C;
  let col = 2;
  labels.forEach((label, i) => {
    const span = (spans && spans[i]) || 1;
    const rg = sh.getRange(row, col, 1, span);
    if (span > 1) rg.merge();
    rg.setValue(label);
    col += span;
  });
  F3_band_(sh, row).setBackground(C.head).setFontSize(8).setFontWeight('bold')
    .setFontColor(C.muted).setWrap(true).setHorizontalAlignment('center')
    .setBorder(true, null, true, null, null, null, C.line, SpreadsheetApp.BorderStyle.SOLID);
  sh.setRowHeight(row, 34);
}

function F3_bodyRows_(sh, row, n) {
  const C = F3.C;
  if (n <= 0) return;
  const rg = F3_band_(sh, row, n);
  rg.setFontSize(10).setHorizontalAlignment('center')
    .setBorder(null, null, true, null, null, true, C.line, SpreadsheetApp.BorderStyle.SOLID);
  const bg = [];
  for (let i = 0; i < n; i++) bg.push(new Array(16).fill(i % 2 ? C.panel : '#FFFFFF'));
  rg.setBackgrounds(bg);
  sh.setRowHeights(row, n, 26);
}

// 01 — Indicateurs clés (2 rangées de 6 cartes)
function F3_renderKpis_(sh, row, model) {
  const C = F3.C, k = model.kpi;
  row = F3_sectionTitle_(sh, row, '01', 'Indicateurs clés',
    'Ratios calculés sur Départ → Arrivée (route) et Arrivée → Fin (terrain)');
  const groups = [[2, 3], [5, 2], [7, 4], [11, 4], [15, 1], [16, 2]];
  const cards = [
    [
      ['Heures totales', k.totalMin / 1440, F3_FMT.dur, k.personDays + ' jours-personne', C.blue],
      ['Jobs approuvés', k.jobs, F3_FMT.int, k.emps + ' employés actifs', C.blue],
      ['KM parcourus', k.km, F3_FMT.km, Math.round(k.kmPerJob) + ' km / job en moyenne', C.blue],
      ['Moyenne / job', k.avgJob / 1440, F3_FMT.dur, 'de Départ à Fin', C.violet],
      ['H / jour', k.avgDay / 1440, F3_FMT.dur, 'par employé', C.violet],
      ['Période', k.firstSerial === null ? '—' : F3_fmtSerial_(k.firstSerial), '@',
        k.lastSerial === null ? '' : 'au ' + F3_fmtSerial_(k.lastSerial), C.violet],
    ],
    [
      ['Temps de route', k.routePct, F3_FMT.pct1, 'du temps total', C.amber],
      ['Efficacité terrain', 1 - k.routePct, F3_FMT.pct1, 'du temps passé sur site', C.green],
      ['Heures > 8 h / jour', k.otMin / 1440, F3_FMT.dur, 'estimation — la paie fait foi', C.amber],
      ['Jobs / jour', k.personDays ? k.jobs / k.personDays : 0, '0.0', 'par employé', C.teal],
      ['Alertes', k.alerts, F3_FMT.int, k.critical + ' critique(s)', k.alerts ? C.red : C.green],
      ['Qualité des données', k.jobs ? 1 - k.alerts / k.jobs : 1, F3_FMT.pct1,
        'jobs sans anomalie' + (model.skipped ? ' · ' + model.skipped + ' ligne(s) ignorée(s)' : ''),
        k.alerts ? C.amber : C.green],
    ],
  ];

  cards.forEach(line => {
    line.forEach((card, i) => {
      const g = groups[i];
      const label = sh.getRange(row, g[0], 1, g[1]);
      const value = sh.getRange(row + 1, g[0], 1, g[1]);
      const cap = sh.getRange(row + 2, g[0], 1, g[1]);
      [label, value, cap].forEach(r => { if (g[1] > 1) r.merge(); });
      label.setValue(card[0].toUpperCase()).setFontSize(8).setFontWeight('bold').setFontColor(C.muted);
      value.setValue(card[1]).setNumberFormat(card[2]).setFontSize(card[2] === '@' ? 14 : 22)
        .setFontWeight('bold').setFontColor(C.ink);
      cap.setValue(card[3]).setFontSize(9).setFontColor(C.muted);
      const box = sh.getRange(row, g[0], 3, g[1]);
      box.setBackground(C.panel).setHorizontalAlignment('center')
        .setBorder(true, true, true, true, null, null, '#FFFFFF', SpreadsheetApp.BorderStyle.SOLID_THICK);
      label.setBorder(true, null, null, null, null, null, card[4], SpreadsheetApp.BorderStyle.SOLID_THICK);
      value.setFontColor(card[4] === C.red ? C.red : C.ink);
    });
    sh.setRowHeight(row, 28);
    sh.setRowHeight(row + 1, 42);
    sh.setRowHeight(row + 2, 24);
    sh.setRowHeight(row + 3, 10);
    row += 4;
  });
  return row;
}

// 02 — Graphiques
function F3_renderCharts_(sh, row, model) {
  row = F3_sectionTitle_(sh, row, '02', 'Tendances', 'Heures décimales · semaines CCQ (dim. → sam.)');
  const height = 300;
  const rowsNeeded = Math.ceil((height + 10) / 21);

  // Séries des graphiques (heures décimales), écrites SOUS les graphiques : les
  // graphiques n’affichent pas les données de colonnes masquées.
  const maxLines = rowsNeeded - 1;
  const empRows = model.emps.slice(0, maxLines).map(e => [e.name, Math.round(e.total / 6) / 10]);
  const empData = [['Employé', 'Heures']].concat(empRows.length ? empRows : [['—', 0]]);
  sh.getRange(row, 2, empData.length, 2).setValues(empData);
  const shown = model.emps.slice(0, F3.EMP_COLS);
  const weekRows = model.weeks.slice(-Math.min(F3.MAX_WEEKS, maxLines)).map(w =>
    ['S' + w.week.no].concat(shown.map(e => Math.round((w.byEmp.get(e.key) || 0) / 6) / 10)));
  const weekData = [['Semaine'].concat(shown.length ? shown.map(e => F3_shortName_(e.name)) : ['—'])]
    .concat(weekRows.length ? weekRows : [['—'].concat(shown.length ? shown.map(() => 0) : [0])]);
  sh.getRange(row, 4, weekData.length, weekData[0].length).setValues(weekData);
  sh.getRange(row, 2, rowsNeeded, 16).setFontColor('#FFFFFF').setFontSize(6);
  model.chartRanges = {
    emp: sh.getRange(row, 2, empData.length, 2),
    week: sh.getRange(row, 4, weekData.length, weekData[0].length),
  };
  const base = {
    fontName: F3.FONT,
    titleTextStyle: { color: F3.C.ink, fontSize: 13, bold: true },
    backgroundColor: '#FFFFFF',
    chartArea: { left: 150, top: 44, width: '70%', height: '72%' },
  };
  const empChart = sh.newChart()
    .setChartType(Charts.ChartType.BAR)
    .addRange(model.chartRanges.emp)
    .setNumHeaders(1)
    .setHiddenDimensionStrategy(Charts.ChartHiddenDimensionStrategy.SHOW_BOTH)
    .setPosition(row, 2, 0, 0)
    .setOption('title', 'Heures par employé')
    .setOption('legend', { position: 'none' })
    .setOption('colors', [F3.C.blue])
    .setOption('width', 700).setOption('height', height)
    .setOption('hAxis', { format: '0', gridlines: { color: F3.C.line }, textStyle: { color: F3.C.muted } })
    .setOption('vAxis', { textStyle: { color: F3.C.text } });
  Object.keys(base).forEach(key => empChart.setOption(key, base[key]));
  sh.insertChart(empChart.build());

  const weekChart = sh.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(model.chartRanges.week)
    .setNumHeaders(1)
    .setHiddenDimensionStrategy(Charts.ChartHiddenDimensionStrategy.SHOW_BOTH)
    .setPosition(row, 10, 0, 0)
    .setOption('title', 'Heures par semaine CCQ')
    .setOption('isStacked', true)
    .setOption('legend', { position: 'bottom', textStyle: { color: F3.C.muted, fontSize: 10 } })
    .setOption('colors', F3.PALETTE)
    .setOption('width', 760).setOption('height', height)
    .setOption('vAxis', { format: '0', gridlines: { color: F3.C.line }, textStyle: { color: F3.C.muted } });
  Object.keys(base).forEach(key => weekChart.setOption(key, base[key]));
  weekChart.setOption('chartArea', { left: 60, top: 44, width: '85%', height: '62%' });
  sh.insertChart(weekChart.build());

  return row + rowsNeeded;
}

// 03 — Classement des employés
function F3_renderRanking_(sh, row, model) {
  const C = F3.C;
  row = F3_sectionTitle_(sh, row, '03', 'Classement des employés', 'Trié par heures totales');
  F3_tableHeader_(sh, row,
    ['Rang', 'Employé', 'Jobs', 'Jours', 'Heures', 'H / jour', 'H / job', 'KM', 'KM / job',
     '% route', 'Efficacité terrain', 'Part des heures', 'H > 8 h/j (est.)', 'Part %'],
    [1, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  row++;
  const n = model.emps.length;
  if (!n) return F3_emptyRow_(sh, row, 'Aucun employé dans ' + F3.SOURCE + '.');
  F3_bodyRows_(sh, row, n);
  const totalAll = model.kpi.totalMin || 1;
  const maxTotal = Math.max.apply(null, model.emps.map(e => e.total)) / 1440 || 1;
  const medals = ['🥇', '🥈', '🥉'];
  const values = model.emps.map((e, i) => [
    medals[i] || String(i + 1),
    e.name, '', '',
    e.jobs,
    e.dayCount,
    e.total / 1440,
    e.dayCount ? e.total / e.dayCount / 1440 : 0,
    e.jobs ? e.total / e.jobs / 1440 : 0,
    e.km,
    e.jobs ? e.km / e.jobs : 0,
    e.routePct,
    e.routeBase ? 1 - e.routePct : '',
    '',
    e.otMin / 1440,
    e.total / totalAll,
  ]);
  sh.getRange(row, 2, n, 16).setValues(values);
  sh.getRange(row, 3, n, 3).mergeAcross();
  sh.getRange(row, 3, n, 1).setHorizontalAlignment('left').setFontWeight('bold').setFontColor(C.ink);
  sh.getRange(row, 2, n, 1).setFontSize(13);
  sh.getRange(row, 8, n, 3).setNumberFormat(F3_FMT.dur);
  sh.getRange(row, 8, n, 1).setFontWeight('bold');
  sh.getRange(row, 11, n, 1).setNumberFormat(F3_FMT.int);
  sh.getRange(row, 12, n, 1).setNumberFormat('0.0');
  sh.getRange(row, 13, n, 2).setNumberFormat(F3_FMT.pct);
  sh.getRange(row, 16, n, 1).setNumberFormat(F3_FMT.dur);
  sh.getRange(row, 17, n, 1).setNumberFormat(F3_FMT.pct1);
  const SLOTS = 20;
  const onStyle = SpreadsheetApp.newTextStyle().setForegroundColor(C.blue).build();
  const offStyle = SpreadsheetApp.newTextStyle().setForegroundColor(C.line).build();
  const bars = model.emps.map(e => {
    const k = Math.max(e.total ? 1 : 0, Math.round(SLOTS * (e.total / 1440) / maxTotal));
    const b = SpreadsheetApp.newRichTextValue().setText('█'.repeat(SLOTS));
    if (k > 0) b.setTextStyle(0, k, onStyle);
    if (k < SLOTS) b.setTextStyle(k, SLOTS, offStyle);
    return [b.build()];
  });
  sh.getRange(row, 15, n, 1).setRichTextValues(bars).setHorizontalAlignment('left').setFontSize(9);

  // Efficacité terrain : dégradé ; H > 8 h : ambre si > 0
  const rules = sh.getConditionalFormatRules();
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .setRanges([sh.getRange(row, 14, n, 1)])
    .setGradientMinpoint('#FEF3C7').setGradientMaxpoint('#A7F3D0').build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .setRanges([sh.getRange(row, 16, n, 1)]).whenNumberGreaterThan(0)
    .setFontColor(C.amber).setBold(true).build());
  sh.setConditionalFormatRules(rules);

  // Ligne de total
  const t = row + n;
  const k = model.kpi;
  sh.getRange(t, 2, 1, 16).setValues([[
    '', 'TOTAL ÉQUIPE', '', '', k.jobs, k.personDays, k.totalMin / 1440, k.avgDay / 1440,
    k.avgJob / 1440, k.km, k.kmPerJob, k.routePct, 1 - k.routePct, '', k.otMin / 1440, 1]]);
  sh.getRange(t, 3, 1, 3).merge();
  F3_band_(sh, t).setBackground(C.navy2).setFontColor('#FFFFFF').setFontWeight('bold')
    .setHorizontalAlignment('center');
  sh.getRange(t, 3).setHorizontalAlignment('left');
  sh.getRange(t, 8, 1, 3).setNumberFormat(F3_FMT.dur);
  sh.getRange(t, 11).setNumberFormat(F3_FMT.int);
  sh.getRange(t, 12).setNumberFormat('0.0');
  sh.getRange(t, 13, 1, 2).setNumberFormat(F3_FMT.pct);
  sh.getRange(t, 16).setNumberFormat(F3_FMT.dur);
  sh.getRange(t, 17).setNumberFormat(F3_FMT.pct);
  sh.setRowHeight(t, 28);
  return t + 1;
}

// 04 — Semaines CCQ (carte de chaleur)
function F3_renderWeeks_(sh, row, model, weeksShown) {
  const C = F3.C;
  row = F3_sectionTitle_(sh, row, '04', 'Semaines CCQ',
    'Dimanche → samedi · rouge = plus de 40 h pour un employé');
  const shown = model.emps.slice(0, F3.EMP_COLS);
  const labels = ['Semaine CCQ', 'Jobs', 'Total équipe'];
  for (let i = 0; i < F3.EMP_COLS; i++) labels.push(shown[i] ? F3_shortName_(shown[i].name) : '');
  labels.push('Δ vs préc.');
  F3_tableHeader_(sh, row, labels, [2, 1, 1].concat(new Array(F3.EMP_COLS).fill(1), [1]));
  row++;
  const n = weeksShown.length;
  if (!n) return F3_emptyRow_(sh, row, 'Aucune semaine à afficher.');
  F3_bodyRows_(sh, row, n);
  const values = weeksShown.map(w => {
    const line = [w.week.label, '', w.jobs, w.total / 1440];
    for (let i = 0; i < F3.EMP_COLS; i++) {
      const min = shown[i] ? (w.byEmp.get(shown[i].key) || 0) : 0;
      line.push(min ? min / 1440 : '');
    }
    line.push(w.delta === null ? '—' : w.delta);
    return line;
  });
  sh.getRange(row, 2, n, 16).setValues(values);
  sh.getRange(row, 2, n, 2).mergeAcross();
  sh.getRange(row, 2, n, 1).setHorizontalAlignment('left').setFontWeight('bold').setFontColor(C.ink)
    .setFontSize(9);
  sh.getRange(row, 5, n, 12).setNumberFormat(F3_FMT.dur);
  sh.getRange(row, 5, n, 1).setFontWeight('bold');
  sh.getRange(row, 17, n, 1).setNumberFormat('+0%;-0%;0%').setFontColor(C.muted);

  const heat = sh.getRange(row, 6, n, F3.EMP_COLS);
  const rules = sh.getConditionalFormatRules();
  rules.push(SpreadsheetApp.newConditionalFormatRule().setRanges([heat])
    .whenNumberGreaterThan(F3.WEEKLY_LIMIT_MIN / 1440)
    .setBackground('#FECACA').setFontColor(C.red).setBold(true).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().setRanges([heat])
    .setGradientMinpointWithValue('#FFFFFF', SpreadsheetApp.InterpolationType.NUMBER, '0')
    .setGradientMaxpointWithValue('#60A5FA', SpreadsheetApp.InterpolationType.NUMBER,
      String(F3.WEEKLY_LIMIT_MIN / 1440))
    .build());
  sh.setConditionalFormatRules(rules);
  if (model.emps.length > F3.EMP_COLS) {
    sh.getRange(row + n, 2, 1, 16).merge()
      .setValue('+ ' + (model.emps.length - F3.EMP_COLS) + ' employé(s) non affiché(s) — voir le classement.')
      .setFontSize(9).setFontColor(C.muted).setFontStyle('italic');
    return row + n + 1;
  }
  return row + n;
}

// 05 — Contrôle qualité
function F3_renderAlerts_(sh, row, model, n) {
  const C = F3.C, k = model.kpi;
  row = F3_sectionTitle_(sh, row, '05', 'Contrôle qualité',
    k.alerts + ' job(s) à vérifier · ' + k.critical + ' critique(s)' +
    (model.alertJobs.length > n ? ' · ' + n + ' premiers affichés' : ''));
  F3_tableHeader_(sh, row, F3_DATA_HEADERS);
  row++;
  if (!n) return F3_emptyRow_(sh, row, '✅  Aucune anomalie détectée — toutes les entrées sont cohérentes.', C.green);
  F3_bodyRows_(sh, row, n);
  const empName = new Map(model.emps.map(e => [e.key, e.name]));
  const list = model.alertJobs.slice(0, n);
  sh.getRange(row, 2, n, 16).setValues(list.map(j => [
    j.serial, F3.JOURS[j.dow], 'S' + j.week.no, empName.get(j.empKey), j.ot,
    j.dep === null ? '' : j.dep / 1440, j.arr === null ? '' : j.arr / 1440, j.fin === null ? '' : j.fin / 1440,
    j.route / 1440, j.onsite / 1440, j.total / 1440, j.km,
    j.arrOk && j.total ? j.route / j.total : '', j.alerts.join(' · '), j.par, j.id]));
  F3_formatJobColumns_(sh, row, n);
  const colors = list.map(j => [j.sev === 3 ? C.red : j.sev === 2 ? C.amber : '#A16207']);
  sh.getRange(row, 15, n, 1).setFontColors(colors).setFontWeight('bold');
  return row + n;
}

function F3_formatJobColumns_(sh, row, n) {
  const C = F3.C;
  sh.getRange(row, 2, n, 1).setNumberFormat(F3_FMT.date);
  sh.getRange(row, 3, n, 2).setFontColor(C.muted);
  sh.getRange(row, 5, n, 1).setHorizontalAlignment('left').setFontWeight('bold').setFontColor(C.ink);
  sh.getRange(row, 6, n, 1).setFontWeight('bold').setFontColor(C.blue);
  sh.getRange(row, 7, n, 3).setNumberFormat(F3_FMT.time);
  sh.getRange(row, 10, n, 3).setNumberFormat(F3_FMT.dur);
  sh.getRange(row, 12, n, 1).setFontWeight('bold');
  sh.getRange(row, 13, n, 1).setNumberFormat(F3_FMT.int);
  sh.getRange(row, 14, n, 1).setNumberFormat(F3_FMT.pct);
  sh.getRange(row, 15, n, 1).setHorizontalAlignment('left').setFontSize(9).setWrap(true);
  sh.getRange(row, 16, n, 1).setFontColor(C.muted).setFontSize(9);
  sh.getRange(row, 17, n, 1).setFontColor(C.faint).setFontSize(8).setHorizontalAlignment('left')
    .setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
}

function F3_emptyRow_(sh, row, text, color) {
  sh.getRange(row, 2, 1, 16).merge().setValue(text).setHorizontalAlignment('center')
    .setFontColor(color || F3.C.muted).setFontStyle('italic').setBackground(F3.C.panel);
  sh.setRowHeight(row, 34);
  return row + 1;
}

// 06 — Explorateur (recherche + filtres dynamiques)
function F3_renderExplorer_(sh, row, model, saved) {
  const C = F3.C;
  row = F3_sectionTitle_(sh, row, '06', 'Explorateur de jobs',
    'Modifiez les champs bleus — les résultats se mettent à jour instantanément');
  const f = row;
  PropertiesService.getDocumentProperties().setProperty('F3_FILTER_ROW', String(f));

  const label = (col, text) => sh.getRange(f, col).setValue(text).setHorizontalAlignment('right')
    .setFontSize(9).setFontWeight('bold').setFontColor(C.muted);
  const input = (col, span) => {
    const rg = sh.getRange(f, col, 1, span);
    if (span > 1) rg.merge();
    rg.setBackground(C.blueSoft).setFontWeight('bold').setFontColor(C.ink).setHorizontalAlignment('left')
      .setBorder(true, true, true, true, null, null, C.blueLine, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    return sh.getRange(f, col);
  };
  label(2, 'EMPLOYÉ');
  const names = ['Tous'].concat(model.emps.map(e => e.name).sort((a, b) => a.localeCompare(b)));
  input(3, 3).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(names, true).setAllowInvalid(false).build())
    .setValue(names.indexOf(saved.emp) !== -1 ? saved.emp : 'Tous');
  label(6, 'DU');
  input(7, 2).setDataValidation(SpreadsheetApp.newDataValidation().requireDate()
    .setAllowInvalid(false).setHelpText('Date de début (vide = sans limite)').build())
    .setNumberFormat(F3_FMT.date).setValue(saved.from || '');
  label(9, 'AU');
  input(10, 2).setDataValidation(SpreadsheetApp.newDataValidation().requireDate()
    .setAllowInvalid(false).setHelpText('Date de fin (vide = sans limite)').build())
    .setNumberFormat(F3_FMT.date).setValue(saved.to || '');
  label(12, 'RECHERCHE');
  input(13, 3).setValue(saved.q || '')
    .setNote('Cherche dans : OT, employé, alertes, approbateur et JobID (ex. 1875, outils, Vitesse).');
  label(16, 'ALERTES SEUL.');
  sh.getRange(f, 17).insertCheckboxes().setValue(saved.alerts === true).setHorizontalAlignment('center');
  sh.setRowHeight(f, 32);

  // Conditions partagées par les résultats et le résumé
  const n = Math.max(model.dataRows, 1);
  const col = i => {
    const letter = F3_colLetter_(F3.DATA_COL + i);
    return '$' + letter + '$2:$' + letter + '$' + (n + 1);
  };
  const emp = '$C$' + f, from = '$G$' + f, to = '$J$' + f, q = '$M$' + f, only = '$Q$' + f;
  const conds = [
    '((' + emp + '="")+(' + emp + '="Tous")+(' + col(3) + '=' + emp + '))',
    '((' + from + '="")+(' + col(0) + '>=' + from + '))',
    '((' + to + '="")+(' + col(0) + '<=' + to + '))',
    '((' + q + '="")+ISNUMBER(SEARCH(' + q + ',' + col(4) + '&" "&' + col(3) + '&" "&' + col(13) +
      '&" "&' + col(14) + '&" "&' + col(15) + ')))',
    '(NOT(' + only + ')+(' + col(13) + '<>""))',
  ].join(',');
  const block = '$' + F3_colLetter_(F3.DATA_COL) + '$2:$' + F3_colLetter_(F3.DATA_COL + 15) + '$' + (n + 1);
  const sumOf = i => 'SUM(FILTER(' + col(i) + ',' + conds + '))';

  // Résumé dynamique
  const s = f + 1;
  sh.setRowHeight(s, 8);
  const chips = [
    [2, 2, '=IFERROR(ROWS(FILTER(' + col(15) + ',' + conds + ')),0)', '0" job(s)"'],
    [4, 2, '=IFERROR(' + sumOf(10) + ',0)', '[h]"h"mm" au total"'],
    [6, 3, '=IFERROR(' + sumOf(10) + '/ROWS(FILTER(' + col(15) + ',' + conds + ')),0)', '[h]"h"mm" / job"'],
    [9, 2, '=IFERROR(' + sumOf(11) + ',0)', '#,##0" km"'],
    [11, 3, '=IFERROR(' + sumOf(8) + '/' + sumOf(10) + ',0)', '0%" de route"'],
    [14, 1, '=IFERROR(COUNTUNIQUE(FILTER(' + col(3) + ',' + conds + ')),0)', '0" empl."'],
    [15, 3, '=IFERROR(SUMPRODUCT(--(LEN(FILTER(' + col(13) + ',' + conds + '))>0)),0)', '0" alerte(s)"'],
  ];
  chips.forEach(ch => {
    const rg = sh.getRange(s + 1, ch[0], 1, ch[1]);
    if (ch[1] > 1) rg.merge();
    rg.setFormula(F3_fx_(ch[2])).setNumberFormat(ch[3]).setHorizontalAlignment('center')
      .setFontWeight('bold').setFontSize(11).setFontColor(C.ink).setBackground(C.head)
      .setBorder(true, true, true, true, null, null, '#FFFFFF', SpreadsheetApp.BorderStyle.SOLID_THICK);
  });
  sh.setRowHeight(s + 1, 34);
  sh.setRowHeight(s + 2, 8);

  const h = s + 3;
  F3_tableHeader_(sh, h, F3_DATA_HEADERS);
  const r0 = h + 1;
  const rows = Math.max(model.dataRows, 1);
  F3_bodyRows_(sh, r0, rows);
  F3_formatJobColumns_(sh, r0, rows);
  sh.getRange(r0, 2).setFormula(F3_fx_('=IFERROR(SORT(FILTER(' + block + ',' + conds + '),1,0,6,1),' +
    '"Aucun job ne correspond aux filtres.")'));

  const alertCol = sh.getRange(r0, 15, rows, 1);
  const rules = sh.getConditionalFormatRules();
  rules.push(SpreadsheetApp.newConditionalFormatRule().setRanges([alertCol])
    .whenTextContains('🔴').setFontColor(C.red).setBold(true).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().setRanges([alertCol])
    .whenTextContains('🟠').setFontColor(C.amber).setBold(true).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().setRanges([alertCol])
    .whenTextContains('🟡').setFontColor('#A16207').build());
  sh.setConditionalFormatRules(rules);

  const end = r0 + rows;
  sh.getRange(end + 1, 2, 1, 16).merge()
    .setValue('Sparklog · Onglet Stats généré automatiquement à partir de « ' + F3.SOURCE +
      ' » (lecture seule). Ne modifiez que les champs bleus de l’explorateur.')
    .setFontSize(8).setFontColor(C.faint).setHorizontalAlignment('center');
  return end + 2;
}

function F3_colLetter_(col) {
  let s = '';
  while (col > 0) {
    const m = (col - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    col = Math.floor((col - 1) / 26);
  }
  return s;
}

// ═════════════════════════════════════════════════════════════════════════════
// Onglets hebdomadaires « SemXX » (semaine CCQ dimanche → samedi)
// ═════════════════════════════════════════════════════════════════════════════

const F3_WEEK_WIDTHS = [90, 50, 190, 85, 62, 62, 62, 68, 62, 62, 60, 115, 100, 210, 110, 110];
const F3_WEEK_HEADERS = ['Date', 'Jour', 'Employé', 'OT', 'Départ', 'Arrivée', 'Fin', 'Heures',
  'Route', 'Sur site', 'KM', 'Approuvé par', 'Approuvé le', 'Courriel', 'Téléphone', 'JobID'];

/**
 * Crée / met à jour un onglet par semaine CCQ présente dans l’onglet Data.
 * Seuls les onglets dont le contenu a changé sont régénérés (empreinte par semaine).
 * Onglet nommé « Sem42 » ; une semaine d’une autre année CCQ que la plus ancienne
 * reçoit un suffixe (« Sem42 (2027) ») pour ne jamais écraser une autre année.
 */
function F3_syncWeekTabs_(ss, model, force) {
  const props = PropertiesService.getDocumentProperties();
  let tracked = {};
  try { tracked = JSON.parse(props.getProperty('F3_WEEK_TABS') || '{}'); } catch (e) { tracked = {}; }

  const byWeek = new Map();
  model.jobs.forEach(j => {
    if (!byWeek.has(j.week.key)) byWeek.set(j.week.key, { week: j.week, jobs: [] });
    byWeek.get(j.week.key).jobs.push(j);
  });
  const weeks = Array.from(byWeek.values()).sort((a, b) => a.week.startSerial - b.week.startSerial);
  if (!weeks.length) return;
  const baseYear = Math.min.apply(null, weeks.map(w => w.week.year));
  const empName = new Map(model.emps.map(e => [e.key, e.name]));
  const active = ss.getActiveSheet();
  const next = {};
  let moved = false;

  weeks.forEach(w => {
    const name = 'Sem' + w.week.no + (w.week.year === baseYear ? '' : ' (' + w.week.year + ')');
    const payload = w.jobs.map(j => [j.id, j.serial, empName.get(j.empKey), j.ot, j.dep, j.arr, j.fin,
      j.km, j.par, j.le, j.email, j.tel]);
    payload.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    const hash = F3_fingerprint_(payload);
    next[name] = hash;
    let sh = ss.getSheetByName(name);
    if (sh && !force && tracked[name] === hash) return;
    if (!sh) { sh = ss.insertSheet(name, ss.getSheets().length); moved = true; }
    F3_renderWeekTab_(sh, w, empName);
  });

  // Onglets de semaine devenus vides (jobs retirés de Data) : seulement ceux créés ici.
  Object.keys(tracked).forEach(name => {
    if (next[name]) return;
    const sh = ss.getSheetByName(name);
    if (sh && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });

  // Ordre chronologique, juste après l’onglet Stats.
  if (moved || force) {
    const anchor = ss.getSheetByName(F3.TARGET);
    let pos = anchor ? anchor.getIndex() + 1 : ss.getSheets().length;
    weeks.forEach(w => {
      const name = 'Sem' + w.week.no + (w.week.year === baseYear ? '' : ' (' + w.week.year + ')');
      const sh = ss.getSheetByName(name);
      if (!sh) return;
      if (sh.getIndex() !== pos) { ss.setActiveSheet(sh); ss.moveActiveSheet(pos); }
      pos++;
    });
    if (active) ss.setActiveSheet(active);
  }
  props.setProperty('F3_WEEK_TABS', JSON.stringify(next));
}

function F3_renderWeekTab_(sh, w, empName) {
  const C = F3.C;
  F3_reset_(sh);
  const jobs = w.jobs.slice().sort((a, b) =>
    empName.get(a.empKey).localeCompare(empName.get(b.empKey)) || a.serial - b.serial ||
    (a.dep === null ? 0 : a.dep) - (b.dep === null ? 0 : b.dep));

  // Agrégats par employé et par jour (dimanche = 0 … samedi = 6)
  const emps = new Map();
  jobs.forEach(j => {
    if (!emps.has(j.empKey)) emps.set(j.empKey, { name: empName.get(j.empKey), days: [0, 0, 0, 0, 0, 0, 0],
      jobs: 0, km: 0, total: 0, route: 0, routeBase: 0 });
    const e = emps.get(j.empKey);
    e.days[j.dow] += j.total; e.jobs++; e.km += j.km; e.total += j.total;
    if (j.arrOk) { e.route += j.route; e.routeBase += j.total; }
  });
  const empList = Array.from(emps.values()).sort((a, b) => a.name.localeCompare(b.name));
  const totalMin = jobs.reduce((s, j) => s + j.total, 0);
  const totalKm = jobs.reduce((s, j) => s + j.km, 0);

  const needRows = 30 + empList.length + jobs.length;
  if (sh.getMaxRows() < needRows) sh.insertRowsAfter(sh.getMaxRows(), needRows - sh.getMaxRows());
  if (sh.getMaxColumns() < 18) sh.insertColumnsAfter(sh.getMaxColumns(), 18 - sh.getMaxColumns());
  sh.setHiddenGridlines(true);
  sh.setTabColor(C.teal);
  sh.getRange(1, 1, sh.getMaxRows(), 18).setFontFamily(F3.FONT).setFontSize(10)
    .setFontColor(C.text).setVerticalAlignment('middle').setBackground('#FFFFFF');
  sh.setColumnWidth(1, 22);
  F3_WEEK_WIDTHS.forEach((px, i) => sh.setColumnWidth(i + 2, px));
  sh.setColumnWidth(18, 22);
  if (sh.getMaxColumns() > 18) sh.hideColumns(19, sh.getMaxColumns() - 18);

  // En-tête
  const endSerial = w.week.startSerial + 6;
  let row = 1;
  sh.setRowHeight(row, 14);
  row++;
  F3_band_(sh, row, 4).setBackground(C.navy);
  sh.setRowHeight(row, 14);
  sh.getRange(row + 1, 2, 1, 12).merge().setValue('SEMAINE CCQ ' + w.week.no + '  ·  ' + w.week.year)
    .setFontSize(20).setFontWeight('bold').setFontColor('#FFFFFF');
  sh.getRange(row + 1, 14, 1, 4).merge().setValue('SPARKLOG').setHorizontalAlignment('right')
    .setFontSize(10).setFontWeight('bold').setFontColor('#34D399');
  sh.setRowHeight(row + 1, 40);
  sh.getRange(row + 2, 2, 1, 16).merge()
    .setValue('Dimanche ' + F3_fmtSerial_(w.week.startSerial) + '  →  samedi ' + F3_fmtSerial_(endSerial) +
      '   ·   ' + jobs.length + ' jobs   ·   ' + F3_fmtHM_(totalMin) + '   ·   ' +
      Math.round(totalKm) + ' km   ·   ' + empList.length + ' employé(s)')
    .setFontSize(10).setFontColor('#CBD5E1');
  sh.setRowHeight(row + 2, 24);
  sh.setRowHeight(row + 3, 12);
  row += 4;

  // Résumé par employé et par jour
  row = F3_sectionTitle_(sh, row, '01', 'Résumé par employé',
    'Heures de Départ à Fin · orange = plus de 8 h dans la journée · rouge = plus de 40 h');
  const dayLabels = [];
  for (let d = 0; d < 7; d++) {
    const dt = new Date(Date.UTC(1899, 11, 30) + (w.week.startSerial + d) * 86400000);
    dayLabels.push(F3.JOURS[d] + ' ' + dt.getUTCDate());
  }
  F3_tableHeader_(sh, row, ['Employé'].concat(dayLabels, ['Total', 'H > 8 h/j', 'KM', 'Jobs', 'Statut']),
    [3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2]);
  row++;
  const n = empList.length;
  F3_bodyRows_(sh, row, n);
  sh.getRange(row, 2, n, 16).setValues(empList.map(e => {
    const over = e.days.reduce((s, m) => s + Math.max(0, m - F3.DAILY_REGULAR_MIN), 0);
    return [e.name, '', ''].concat(e.days.map(m => m ? m / 1440 : ''),
      [e.total / 1440, over ? over / 1440 : '', e.km, e.jobs,
       e.total > F3.WEEKLY_LIMIT_MIN ? '⚠ Plus de 40 h' : '✓ OK', '']);
  }));
  sh.getRange(row, 2, n, 3).mergeAcross();
  sh.getRange(row, 16, n, 2).mergeAcross();
  sh.getRange(row, 2, n, 1).setHorizontalAlignment('left').setFontWeight('bold').setFontColor(C.ink);
  sh.getRange(row, 5, n, 9).setNumberFormat(F3_FMT.dur);
  sh.getRange(row, 12, n, 1).setFontWeight('bold');
  sh.getRange(row, 14, n, 1).setNumberFormat(F3_FMT.int);
  const rules = [];
  rules.push(SpreadsheetApp.newConditionalFormatRule().setRanges([sh.getRange(row, 5, n, 7)])
    .whenNumberGreaterThan(F3.DAILY_REGULAR_MIN / 1440).setBackground(C.amberSoft)
    .setFontColor(C.amber).setBold(true).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().setRanges([sh.getRange(row, 12, n, 1)])
    .whenNumberGreaterThan(F3.WEEKLY_LIMIT_MIN / 1440).setBackground('#FECACA')
    .setFontColor(C.red).setBold(true).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().setRanges([sh.getRange(row, 13, n, 1)])
    .whenNumberGreaterThan(0).setFontColor(C.amber).setBold(true).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().setRanges([sh.getRange(row, 16, n, 1)])
    .whenTextContains('⚠').setFontColor(C.red).setBold(true).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().setRanges([sh.getRange(row, 16, n, 1)])
    .whenTextContains('✓').setFontColor(C.green).build());

  // Total équipe
  const t = row + n;
  const dayTotals = [0, 0, 0, 0, 0, 0, 0];
  empList.forEach(e => e.days.forEach((m, d) => { dayTotals[d] += m; }));
  const overAll = empList.reduce((s, e) =>
    s + e.days.reduce((x, m) => x + Math.max(0, m - F3.DAILY_REGULAR_MIN), 0), 0);
  sh.getRange(t, 2, 1, 16).setValues([['TOTAL ÉQUIPE', '', ''].concat(
    dayTotals.map(m => m ? m / 1440 : ''), [totalMin / 1440, overAll ? overAll / 1440 : '', totalKm,
    jobs.length, '', ''])]);
  sh.getRange(t, 2, 1, 3).merge();
  sh.getRange(t, 16, 1, 2).merge();
  F3_band_(sh, t).setBackground(C.navy2).setFontColor('#FFFFFF').setFontWeight('bold')
    .setHorizontalAlignment('center');
  sh.getRange(t, 2).setHorizontalAlignment('left');
  sh.getRange(t, 5, 1, 9).setNumberFormat(F3_FMT.dur);
  sh.getRange(t, 14).setNumberFormat(F3_FMT.int);
  sh.setRowHeight(t, 28);
  row = t + 1;

  // Détail des jobs (tableau filtrable, prêt à exporter)
  row = F3_sectionTitle_(sh, row, '02', 'Détail des jobs',
    'Trié par employé, date et heure de départ · filtres dans l’en-tête');
  F3_tableHeader_(sh, row, F3_WEEK_HEADERS);
  const h = row;
  row++;
  const m = jobs.length;
  F3_bodyRows_(sh, row, m);
  sh.getRange(row, 5, m, 1).setNumberFormat('@');   // OT et téléphone restent du texte
  sh.getRange(row, 16, m, 1).setNumberFormat('@');
  sh.getRange(row, 2, m, 16).setValues(jobs.map(j => [
    j.serial, F3.JOURS[j.dow], empName.get(j.empKey), j.ot,
    j.dep === null ? '' : j.dep / 1440, j.arr === null ? '' : j.arr / 1440, j.fin === null ? '' : j.fin / 1440,
    j.total / 1440, j.route / 1440, j.onsite / 1440, j.km, j.par, j.le, j.email, j.tel, j.id]));
  // Couleur alternée par employé (pas par ligne) pour lire les groupes d’un coup d’œil
  let shade = false;
  const bg = jobs.map((j, i) => {
    if (i > 0 && jobs[i - 1].empKey !== j.empKey) shade = !shade;
    return new Array(16).fill(shade ? C.panel : '#FFFFFF');
  });
  sh.getRange(row, 2, m, 16).setBackgrounds(bg);
  sh.getRange(row, 2, m, 1).setNumberFormat(F3_FMT.date);
  sh.getRange(row, 3, m, 1).setFontColor(C.muted);
  sh.getRange(row, 4, m, 1).setHorizontalAlignment('left').setFontWeight('bold').setFontColor(C.ink);
  sh.getRange(row, 5, m, 1).setFontWeight('bold').setFontColor(C.blue);
  sh.getRange(row, 6, m, 3).setNumberFormat(F3_FMT.time);
  sh.getRange(row, 9, m, 3).setNumberFormat(F3_FMT.dur);
  sh.getRange(row, 9, m, 1).setFontWeight('bold');
  sh.getRange(row, 12, m, 1).setNumberFormat(F3_FMT.int);
  sh.getRange(row, 13, m, 5).setFontColor(C.muted).setFontSize(9);
  sh.getRange(row, 17, m, 1).setFontColor(C.faint).setFontSize(8)
    .setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
  sh.setConditionalFormatRules(rules);
  sh.getRange(h, 2, m + 1, 16).createFilter();

  sh.getRange(row + m + 1, 2, 1, 16).merge()
    .setValue('Sparklog · Onglet généré automatiquement à partir de « ' + F3.SOURCE +
      ' ». Corrigez les données dans ' + F3.SOURCE + ' : cet onglet est recréé à chaque changement.')
    .setFontSize(8).setFontColor(C.faint).setHorizontalAlignment('center');
}

// Export pour les tests Node (ignoré par Apps Script).
if (typeof module !== 'undefined') {
  module.exports = { F3, F3_parseRows_, F3_buildModel_, F3_ccqWeek_, F3_render_, F3_colLetter_,
    F3_titleCase_, F3_shortName_, F3_fmtHM_ };
}
