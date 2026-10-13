// Reference sheet of every pay rule SparkLog applies: the value in force (read from the
// code constants, so the sheet cannot drift from the calculation), the per-employee option
// that changes it, its status and its source. Shown in Gestion › Avancé › Règles de paie.
//
// Status: "source" — primary source cited (convention, CCQ, ACQ, Revenu Québec, CRA);
//         "messier" — owner (interim payroll authority) decision, beyond or without a source;
//         "review"  — value in use but still to confirm;
//         "missing" — data the employer must still supply (the calculation stays requires_review).
import { ENGINE_VERSION, MEAL_AFTER_DAILY_MINUTES, CONGES_INDEMNITY_RATES } from "./payroll-calculations";
import { DEFAULT_STORAGE_AMOUNT } from "./weekly-allowances";
import {
  CCQ_ELECTRICIAN_IC_C3, CCQ_PRELEVEMENT_RATE, CCQ_CAISSE_EDUCATION_PER_HOUR,
} from "../payroll/ccq-benefits.js";
import { RULE_VERSION, RRQ, EI, RQAP, FSS, LABOUR_STANDARDS, WORKFORCE_FUND } from "../payroll/rules/2026.js";

const REPO = "https://github.com/0XNatasim/Sparklog/blob/main/";
export const PAY_RULE_DOCS = {
  convention: { label: "Convention collective ICI 2025-2029 (ACQ)", url: `${REPO}docs/reference/convention-collective-ici-2025-2029.pdf` },
  acq: { label: "ACQ — Taux horaires suggérés, 26 avril 2026", url: `${REPO}docs/reference/acq-grilles-taux-ici-2026-04-26.pdf` },
  ccqTaxable: { label: "CCQ — Avantages imposables ICI 2026-2027", url: `${REPO}tests/Tableau-Institutionnel-Commercial-2026-2027.pdf` },
  ccqDues: { label: "CCQ — Cotisations syndicales", url: "https://www.ccq.org/fr-CA/avantages-sociaux/salaire-taux/cotisations-syndicales" },
  ccqMay2026: { label: "CCQ — Rapport mensuel de mai 2026 (20 avril 2026)", url: "https://www.ccq.org/fr-CA/Nouvelles/2026/cc-rapport-mensuel-mai-2026" },
  tp1015g: { label: "Revenu Québec — TP-1015.G (2026-01)", url: `${REPO}docs/reference/TP-1015.G(2026-01).pdf` },
  tp1015f: { label: "Revenu Québec — TP-1015.F (2026-01)", url: `${REPO}tests/TP-1015.F(2026-01).pdf` },
  t4127: { label: "ARC — T4127 (janvier 2026)", url: `${REPO}tests/t4127-01-26f.pdf` },
  rules: { label: "docs/rules/compensation-rules.md", url: `${REPO}docs/rules/compensation-rules.md` },
};

export const PAY_RULE_STATUSES = ["source", "messier", "review", "missing"];

function formatters(lang) {
  const locale = lang === "fr" ? "fr-CA" : "en-CA";
  const money = (v, digits = 2) => new Intl.NumberFormat(locale, { style: "currency", currency: "CAD", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
  const pct = (v, digits = 2) => `${new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(v * 100)} %`;
  const hours = (min) => { const h = Math.floor(min / 60), m = min % 60; return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`; };
  return { money, pct, hours };
}

// Returns [{ id, title, rows: [{ id, label, value, detail, option, status, sources }] }] in `lang`.
export function payRulesReference(lang = "fr") {
  const fr = lang === "fr";
  const L = (frText, enText) => (fr ? frText : enText);
  const { money, pct, hours } = formatters(lang);
  const c3 = CCQ_ELECTRICIAN_IC_C3;
  const lv = c3.levels;
  const apprentices = ["apprentice1", "apprentice2", "apprentice3", "apprentice4"];
  const ccqTax = c3.medicProvincialTaxRate;

  return [
    {
      id: "hours",
      title: L("Heures et temps supplémentaire", "Hours and overtime"),
      rows: [
        { id: "regular", label: L("Heures normales", "Regular hours"), value: L("8 h par jour, 40 h par semaine (lun.–ven.)", "8 h per day, 40 h per week (Mon–Fri)"),
          detail: L("Au-delà de 8 h de travail dans la journée, c'est du temps supplémentaire.", "Work beyond 8 h in a day is overtime."), status: "source", sources: [["convention", "20.02 1), 2)"], ["convention", "21.01"]] },
        { id: "ot", label: L("Taux du temps supplémentaire", "Overtime rates"), value: L("1re heure de la semaine à 1,5×, ensuite 2×", "First hour of the week at 1.5×, then 2×"),
          detail: L("La 1re heure à 1,5× compte une seule fois par semaine (dimanche → samedi).", "The 1.5× hour is counted once per week (Sunday → Saturday)."), option: "overtime_first_hour_double",
          optionText: L("« 1re heure sup. à temps double » : tout le temps sup. à 2×.", "“First OT hour at double time”: all overtime at 2×."), status: "source", sources: [["convention", "21.02 a)"]] },
        { id: "weekend", label: L("Samedi, dimanche, fériés", "Saturday, Sunday, holidays"), value: L("Saisie bloquée (pas de travail)", "Entry blocked (no work)"),
          detail: L("La convention paie le samedi en temps sup. et le dimanche/férié à 2× dès la 1re heure ; le moteur n'a pas de règle par jour.", "The agreement pays Saturday as overtime and Sunday/holidays at 2× from the first hour; the engine has no day rule."), status: "review", sources: [["convention", "21.01, 21.02 b)"]] },
        { id: "first-trip", label: L("1er trajet de la journée", "First trip of the day"), value: L("Payé (par défaut)", "Paid (default)"),
          detail: L("Option cochée : le Départ → Arrivée du 1er job n'est pas payé et ne compte pas dans le 8 h.", "Option on: the first job's Départ → Arrivée is unpaid and left out of the 8 h."), option: "first_trip_unpaid",
          optionText: L("« 1er trajet non payé »", "“First trip unpaid”"), status: "messier", sources: [["convention", "20.01 1)"], ["rules", ""]] },
        { id: "return", label: L("Temps de retour à l'entrepôt", "Return-to-warehouse time"), value: L("Jamais du temps sup. ; taux simple sans avantages", "Never overtime; base rate without benefits"),
          detail: L("Option cochée (bonus Messier) : avec avantages tant que travail + retour ≤ 8 h ; le reste sans avantages.", "Option on (Messier bonus): with benefits while work + return ≤ 8 h; the rest without benefits."), option: "return_with_benefits_to_8h",
          optionText: L("« Temps de retour avec avantages sociaux jusqu'à 8h »", "“Return time with social benefits up to 8h”"), status: "messier", sources: [["convention", "23.04 2) a), 23.15"], ["rules", "RETURN"]] },
        { id: "lunch", label: L("Dîner", "Lunch"), value: L("½ h ou 1 h non payée", "½ h or 1 h unpaid"),
          detail: L("Les employés l'enlèvent déjà de leur saisie Départ → Fin.", "Employees already leave it out of their Départ → Fin entries."), status: "source", sources: [["convention", "20.02 3)"]] },
        { id: "subcontractor", label: L("Sous-traitants", "Subcontractors"), value: L("Taux simple jusqu'à 8 h, taux double négocié au-delà", "Simple rate up to 8 h, negotiated double rate beyond"),
          detail: L("Pas de palier à 1,5× ; retour toujours au taux simple ; options verrouillées.", "No 1.5× tier; return always at the simple rate; options locked."), status: "messier", sources: [["rules", ""]] },
      ],
    },
    {
      id: "wages",
      title: L("Salaire, primes et indemnités", "Wages, premiums and allowances"),
      rows: [
        { id: "wage", label: L("Taux horaire électricien (C3)", "Electrician hourly rate (C3)"),
          value: `${L("Compagnon", "Journeyman")} ${money(lv.journeyman.hourlyWage)} · ${apprentices.map((k, i) => `${L("P", "P")}${i + 1} ${money(lv[k].hourlyWage)}`).join(" · ")}`,
          detail: L(`En vigueur du ${c3.effectiveFrom} au ${c3.effectiveTo}. Le taux de chaque employé est dans sa fiche.`, `In force ${c3.effectiveFrom} to ${c3.effectiveTo}. Each employee's rate is on their profile.`), status: "source", sources: [["convention", "annexe C"], ["acq", "col. (1)"]] },
        { id: "premium", label: L("Prime de chef d'équipe", "Team-leader premium"), value: L("Montant $/h par employé (8 % = 4,06 $ pour un compagnon)", "Per-employee $/h (8% = $4.06 for a journeyman)"),
          detail: L("Payée sur les heures normales. Option cochée : aussi sur les heures sup., majorée ×1,5 / ×2. Exclue du 13 % et du prélèvement.", "Paid on regular hours. Option on: also on overtime, multiplied ×1.5 / ×2. Excluded from the 13% and the levy."),
          option: "team_leader_premium_overtime", optionText: L("« Prime de chef d'équipe majorée en temps sup. »", "“Team-leader premium on overtime”"), status: "source", sources: [["convention", "22.01, 22.03 1)"]] },
        { id: "meal", label: L("Souper", "Supper"), value: L(`30 $ quand la journée payée dépasse ${hours(MEAL_AFTER_DAILY_MINUTES)}`, `$30 when the paid day goes past ${hours(MEAL_AFTER_DAILY_MINUTES)}`),
          detail: L("En semaine seulement, un par jour, reçu et approbation du gestionnaire. Le 2e repas (après 4 autres heures sup.) n'est pas codé.", "Weekdays only, one per day, receipt and manager approval. The 2nd meal (after 4 more OT hours) is not coded."), status: "source", sources: [["convention", "20.07 3) c) i."]] },
        { id: "parking", label: L("Stationnement", "Parking"), value: L("Jusqu'à 20 $ par jour, sur reçu", "Up to $20 per day, with receipt"), status: "source", sources: [["convention", "23.02 3)"]] },
        { id: "km", label: L("Kilométrage", "Mileage"), value: L("0,65 $/km par défaut (taux par employé)", "$0.65/km by default (per-employee rate)"),
          detail: L("La convention fixe un minimum de 0,49 $/km.", "The agreement sets a $0.49/km minimum."), option: "km_rate", optionText: L("Taux km (Règles de temps)", "Km rate (Time rules)"), status: "messier", sources: [["convention", "23.05 1)"]] },
        { id: "phone", label: L("Données cellulaire", "Phone data"), value: L("7 $ par semaine travaillée par défaut", "$7 per worked week by default"), option: "phone_data_reimbursement", optionText: L("Montant hebdomadaire (Règles de temps)", "Weekly amount (Time rules)"), status: "messier", sources: [] },
        { id: "storage", label: L("Entreposage", "Storage"), value: L(`${money(DEFAULT_STORAGE_AMOUNT)} par semaine travaillée si activé`, `${money(DEFAULT_STORAGE_AMOUNT)} per worked week when enabled`), option: "storage_compensation", optionText: L("Case et montant (Règles de temps)", "Checkbox and amount (Time rules)"), status: "messier", sources: [] },
        { id: "safety", label: L("Équipement de sécurité", "Safety equipment"), value: L(`${money(c3.safetyEquipmentPerHour)} par heure (non imposable)`, `${money(c3.safetyEquipmentPerHour)} per hour (non-taxable)`),
          detail: L("Payé aussi sur le temps de retour.", "Also paid on return time."), status: "source", sources: [["convention", "25.05 3)"], ["acq", "col. (13)"]] },
      ],
    },
    {
      id: "ccq",
      title: L("Avantages sociaux CCQ et retenues CCQ", "CCQ benefits and CCQ withholdings"),
      rows: [
        { id: "indemnity", label: L("Indemnité de congés", "Leave indemnity"), value: pct(CONGES_INDEMNITY_RATES.vacation + CONGES_INDEMNITY_RATES.statutoryHolidays + CONGES_INDEMNITY_RATES.sick, 1),
          detail: L("6 % vacances + 5,5 % fériés + 1,5 % maladie, sur le salaire gagné (temps sup. compris, prime exclue). Payée par l'employeur à la CCQ.", "6% vacation + 5.5% holidays + 1.5% sick leave, on wages earned (overtime included, premium excluded). Paid by the employer to the CCQ."), status: "source", sources: [["convention", "19.05 1)"], ["acq", "col. (2)"]] },
        { id: "pension", label: L("Cotisation salariale retraite", "Employee pension contribution"), value: L(`${pct(lv.journeyman.employeePensionRate, 1)} compagnon · ${pct(lv.apprentice1.employeePensionRate, 1)} apprenti`, `${pct(lv.journeyman.employeePensionRate, 1)} journeyman · ${pct(lv.apprentice1.employeePensionRate, 1)} apprentice`),
          detail: L("Sur le salaire + 13 %. Déductible de l'impôt du Québec. Minimum apprenti de 0,80 $/h non codé (jamais atteint aux taux actuels).", "On wage + 13%. Deductible from Québec tax. Apprentice $0.80/h minimum not coded (never binding at current rates)."), status: "source", sources: [["convention", "27.05 2)"]] },
        { id: "medic", label: L("Assurance MÉDIC (retenue)", "MÉDIC insurance (withheld)"), value: L(`${money(c3.medicEmployeePerHour)} /h + taxe ${pct(ccqTax, 0)}`, `${money(c3.medicEmployeePerHour)} /h + ${pct(ccqTax, 0)} tax`),
          detail: L("Maintenu à 0,68 $ par le CASIC jusqu'au 24 avril 2027 (la convention prévoyait 0,86 $). À revoir avant cette date.", "Held at $0.68 by the CASIC until April 24, 2027 (the agreement scheduled $0.86). Review before that date."), status: "source", sources: [["ccqMay2026", ""], ["convention", "27.03 A) 2), annexe R"]] },
        { id: "taxable", label: L("Avantage imposable MÉDIC", "MÉDIC taxable benefit"), value: L(`${money(c3.taxableBenefitPerHour, 3)} /h`, `${money(c3.taxableBenefitPerHour, 3)} /h`),
          detail: L("Imposable au Québec et cotisable RRQ ; exclu de la retenue fédérale (T4A).", "Québec-taxable and RRQ-pensionable; excluded from federal withholding (T4A)."), status: "source", sources: [["ccqTaxable", L("code 220, C3", "code 220, C3")]] },
        { id: "employer-benefits", label: L("Avantages sociaux patronaux", "Employer social benefits"), value: L(`${money(lv.journeyman.employerSocialBenefitPerHour, 3)} /h compagnon · ${money(lv.apprentice1.employerSocialBenefitPerHour, 3)} /h apprenti`, `${money(lv.journeyman.employerSocialBenefitPerHour, 3)} /h journeyman · ${money(lv.apprentice1.employerSocialBenefitPerHour, 3)} /h apprentice`),
          detail: L("Affiché au talon puis retiré : ni argent, ni assiette fiscale.", "Shown on the stub then reversed: no cash, no tax base."), status: "source", sources: [["acq", "col. (8)"]] },
        { id: "levy", label: L("Prélèvement CCQ", "CCQ levy"), value: L(`${pct(CCQ_PRELEVEMENT_RATE)} salarié + ${pct(CCQ_PRELEVEMENT_RATE)} employeur`, `${pct(CCQ_PRELEVEMENT_RATE)} employee + ${pct(CCQ_PRELEVEMENT_RATE)} employer`),
          detail: L("Sur le salaire + 13 %. À confirmer : la prime de chef d'équipe entre-t-elle dans la base ?", "On wage + 13%. To confirm: is the team-leader premium in the base?"), status: "review", sources: [["acq", "note (10)"]] },
        { id: "caisse", label: L("Caisse d'éducation syndicale", "Union education fund"), value: L(`${money(CCQ_CAISSE_EDUCATION_PER_HOUR)} par heure`, `${money(CCQ_CAISSE_EDUCATION_PER_HOUR)} per hour`), status: "source", sources: [["ccqDues", ""]] },
        { id: "dues", label: L("Cotisation syndicale", "Union dues"), value: L("Formule de l'association de l'employé", "Formula of the employee's union"),
          detail: L("FIPOE : 55 % d'une heure + 0,05 $/h · local 568 : 65 % (apprenti 50 %) du taux industriel + 0,05 $/h · CSD : 50 % de la 1re heure + 0,035 $/h · CSN et SQC : montants fixes (règles du 28 juin 2026).", "FIPOE: 55% of one hour + $0.05/h · local 568: 65% (apprentice 50%) of the industrial rate + $0.05/h · CSD: 50% of the first hour + $0.035/h · CSN and SQC: fixed amounts (rules of June 28, 2026)."),
          option: "union_association", optionText: L("Association (fiche employé)", "Union (employee profile)"), status: "source", sources: [["ccqDues", ""]] },
      ],
    },
    {
      id: "das",
      title: L("Retenues à la source et cotisations de l'employeur", "Source deductions and employer contributions"),
      rows: [
        { id: "rrq", label: "RRQ", value: L(`${pct(RRQ.tier1.employeeRate)} jusqu'à ${money(RRQ.ympe, 0)} (exemption ${money(RRQ.basicExemption, 0)})`, `${pct(RRQ.tier1.employeeRate)} up to ${money(RRQ.ympe, 0)} (exemption ${money(RRQ.basicExemption, 0)})`), detail: L("Même taux pour l'employeur ; 2e volet à 4 %.", "Same employer rate; second tier at 4%."), status: "source", sources: [["tp1015f", ""]] },
        { id: "ei", label: L("Assurance-emploi", "Employment insurance"), value: L(`${pct(EI.employeeRate)} salarié (max ${money(EI.maxInsurableEarnings, 0)}) · ${pct(EI.employerRate)} employeur`, `${pct(EI.employeeRate)} employee (max ${money(EI.maxInsurableEarnings, 0)}) · ${pct(EI.employerRate)} employer`), status: "source", sources: [["t4127", ""]] },
        { id: "rqap", label: "RQAP", value: L(`${pct(RQAP.employeeRate, 3)} salarié · ${pct(RQAP.employerRate, 3)} employeur (max ${money(RQAP.maxInsurableEarnings, 0)})`, `${pct(RQAP.employeeRate, 3)} employee · ${pct(RQAP.employerRate, 3)} employer (max ${money(RQAP.maxInsurableEarnings, 0)})`), status: "source", sources: [["tp1015f", ""]] },
        { id: "tax", label: L("Impôt fédéral et du Québec", "Federal and Québec income tax"), value: L("Tables 2026 (T4127, TP-1015.F)", "2026 tables (T4127, TP-1015.F)"),
          detail: L("Crédits personnels de base par défaut : les formulaires TD1 / TP-1015.3 des employés ne sont pas encore saisis.", "Basic personal credits by default: employees' TD1 / TP-1015.3 forms are not entered yet."), status: "missing", sources: [["t4127", ""], ["tp1015f", ""]] },
        { id: "fss", label: L("Fonds des services de santé (FSS)", "Health services fund (FSS)"), value: L(`${pct(FSS.general.lowRate)} à ${pct(FSS.general.highRate)} selon la masse salariale`, `${pct(FSS.general.lowRate)} to ${pct(FSS.general.highRate)} depending on payroll`), status: "source", sources: [["tp1015f", ""]] },
        { id: "cnt", label: L("Normes du travail (CNT)", "Labour standards (CNT)"), value: L(`${pct(LABOUR_STANDARDS.rate)} jusqu'à ${money(LABOUR_STANDARDS.maxAssessablePerEmployee, 0)} par employé`, `${pct(LABOUR_STANDARDS.rate)} up to ${money(LABOUR_STANDARDS.maxAssessablePerEmployee, 0)} per employee`), status: "source", sources: [["tp1015g", "§ 7"]] },
        { id: "fdrcmo", label: "FDRCMO", value: L(`${pct(WORKFORCE_FUND.rate, 0)} si la masse salariale dépasse ${money(WORKFORCE_FUND.payrollThreshold, 0)}`, `${pct(WORKFORCE_FUND.rate, 0)} when payroll exceeds ${money(WORKFORCE_FUND.payrollThreshold, 0)}`),
          detail: L("Il manque la masse salariale réelle de Messier.", "Messier's actual payroll is still needed."), status: "missing", sources: [["tp1015g", "§ 8"]] },
        { id: "cnesst", label: "CNESST", value: L("Taux de l'avis de cotisation de Messier", "Rate from Messier's assessment notice"),
          detail: L("Aucun taux par défaut : le calcul reste « à réviser » sans l'avis.", "No default rate: the calculation stays “requires review” without the notice."), status: "missing", sources: [] },
      ],
    },
    {
      id: "status",
      title: L("État du calcul", "Calculation status"),
      rows: [
        { id: "engine", label: L("Moteur des heures", "Hours engine"), value: `v${ENGINE_VERSION}`, detail: L("Même code dans l'app et sur le serveur (classify_week).", "Same code in the app and on the server (classify_week)."), status: "source", sources: [["rules", ""]] },
        { id: "amounts", label: L("Montants de paie (DAS, CCQ)", "Pay amounts (DAS, CCQ)"), value: RULE_VERSION.status === "draft" ? L("Brouillon — à réviser", "Draft — requires review") : L("Validé", "Validated"),
          detail: L("Passe à « validé » après comparaison de 3 à 5 vrais talons et l'accord écrit d'un spécialiste paie/CCQ.", "Becomes “validated” after 3 to 5 real stubs are matched and a payroll/CCQ specialist signs off."), status: RULE_VERSION.status === "draft" ? "review" : "source", sources: [["rules", ""]] },
      ],
    },
  ].map((group) => ({ ...group, rows: group.rows.map((row) => ({ option: null, optionText: null, detail: null, ...row })) }));
}
