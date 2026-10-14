import { describe, expect, it } from "vitest";
import { parseExtractedText, workOrderIssues } from "./work-order-parse";

describe("parseExtractedText", () => {
  it("reads a French work-order screen", () => {
    const text = [
      "OT-190403",
      "Date 07/10/2026",
      "Heure de début 12:33",
      "Heure d'arrivée 12h35",
      "Heure de fin 14:37",
      "Distance réelle parcourue (km) 3,2",
    ].join("\n");
    expect(parseExtractedText(text)).toEqual({
      ot: "190403", job_date: "2026-10-07", depart: "12:33", arrivee: "12:35", fin: "14:37", km_aller: 3,
    });
  });

  it("reads the English variant of the app", () => {
    const text = "OT 204511\n08/10/2026\nStart Time 08:05\nActual Arrival Time 08:40\nEnd Time 16:30\nDistance travelled 42.6";
    expect(parseExtractedText(text)).toEqual({
      ot: "204511", job_date: "2026-10-08", depart: "08:05", arrivee: "08:40", fin: "16:30", km_aller: 43,
    });
  });

  it("returns only what it can read, with no distance when the screen has none", () => {
    expect(parseExtractedText("OT-190403\nHeure de fin 14:37")).toEqual({ ot: "190403", fin: "14:37" });
    expect(parseExtractedText("nothing useful here")).toEqual({});
  });
});

// Field Service "Durée" tab (OT-194509, 2026-10-15): arrival time and real distance left empty.
const DUREE_TAB = [
  "OT-194509", "/ Signature Demandes de soutien Durée",
  "Start Time*", "15/10/2026", "07:26",
  "End Time*", "15/10/2026", "11:26",
  "Duration*", "4 hours",
  "Actual Arrival Time", "---",
  "Déplacement", "Miles Traveled", "-", "34,29", "+",
  "Distance réelle parcourue (km)", "---",
].join("\n");

describe("empty Field Service fields", () => {
  it("never takes a later field's value for an empty one", () => {
    expect(parseExtractedText(DUREE_TAB)).toEqual({
      ot: "194509", job_date: "2026-10-15", depart: "07:26", fin: "11:26", miles_traveled: 34.29,
    });
  });

  it("an empty distance does not pick up a number further down the screen", () => {
    const parsed = parseExtractedText("Distance réelle parcourue (km)\n---\nDuration\n4 hours");
    expect(parsed.km_aller).toBeUndefined();
  });
});

describe("workOrderIssues", () => {
  it("flags the empty arrival time and real distance", () => {
    expect(workOrderIssues(parseExtractedText(DUREE_TAB)).map((i) => i.code)).toEqual(["arrivee", "km"]);
  });

  it("flags Miles Traveled different from the real distance, in whole km", () => {
    const filled = DUREE_TAB.replace("Actual Arrival Time\n---", "Actual Arrival Time\n07:50");
    const withKm = (km) => workOrderIssues(parseExtractedText(filled.replace(/\(km\)\n---/, `(km)\n${km}`)));
    expect(withKm("34")).toEqual([]);
    expect(withKm("30")).toEqual([{ code: "kmMismatch", miles: 34.29, km: 30 }]);
  });

  it("does not compare when Miles Traveled is not on the screenshot", () => {
    const text = "OT-190403\nHeure de début 12:33\nHeure d'arrivée 12h35\nHeure de fin 14:37\nDistance réelle parcourue (km) 3,2";
    expect(workOrderIssues(parseExtractedText(text))).toEqual([]);
  });

  it("lists every missing required field", () => {
    expect(workOrderIssues({}).map((i) => i.code)).toEqual(["ot", "depart", "arrivee", "fin", "km"]);
  });
});

// French Field Service: "Distance parcourue (miles)" is Miles Traveled, never the real distance.
describe("French Field Service screen", () => {
  const french = (km) => [
    "OT-194509", "Heure de début", "15/10/2026", "07:26", "Heure de fin", "15/10/2026", "11:26",
    "Durée", "4 heures", "Heure d'arrivée", "07:50",
    "Déplacement", "Distance parcourue (miles)", "-", "34,29", "+",
    "Distance réelle parcourue (km)", km,
  ].join("\n");

  it("reads the miles field apart from the real distance", () => {
    expect(parseExtractedText(french("34"))).toMatchObject({ arrivee: "07:50", km_aller: 34, miles_traveled: 34.29 });
    expect(workOrderIssues(parseExtractedText(french("34")))).toEqual([]);
  });

  it("an empty real distance is not filled with the miles value", () => {
    const parsed = parseExtractedText(french("---"));
    expect(parsed.km_aller).toBeUndefined();
    expect(workOrderIssues(parsed).map((i) => i.code)).toEqual(["km"]);
  });

  it("flags a different real distance", () => {
    expect(workOrderIssues(parseExtractedText(french("30")))).toEqual([{ code: "kmMismatch", miles: 34.29, km: 30 }]);
  });
});

// Field Service "Bilan" tab in French on a narrow phone (OT-198700, 2026-10-14): long labels wrap on
// two lines and the value sits between them, so the OCR can return the value on either line.
describe("French Bilan tab with wrapped labels", () => {
  const top = [
    "OT-198700", "es et signature\tSoutien et suivis\tBilan",
    "Statut de la\t*\tChargement...", "réservation",
    "Heure de début\t*\t2026-10-14", "08:16",
    "Heure de fin\t*\t2026-10-14", "10:31",
    "Durée\t*\t2,25 heures",
    "Heure d'arrivée\t2026-10-14", "(info)\t08:56",
    "Déplacement",
  ];
  const tail = ["Durée réelle du\t40 minutes", "déplacement"];
  const layouts = {
    "value on the first label line": ["Distance\t-\t55,00\t+", "parcourue (miles)", "Distance réelle\t55,00", "parcourue (km)"],
    "value on the second label line": ["Distance", "parcourue (miles)\t-\t55,00\t+", "Distance réelle", "parcourue (km)\t55,00"],
    "value on its own line": ["Distance", "-\t55,00\t+", "parcourue (miles)", "Distance réelle", "55,00", "parcourue (km)"],
  };

  for (const [name, distanceLines] of Object.entries(layouts)) {
    it(`reads every field (${name})`, () => {
      const parsed = parseExtractedText([...top, ...distanceLines, ...tail].join("\n"));
      expect(parsed).toEqual({
        ot: "198700", job_date: "2026-10-14", depart: "08:16", fin: "10:31", arrivee: "08:56",
        km_aller: 55, miles_traveled: 55,
      });
      expect(workOrderIssues(parsed)).toEqual([]);
    });
  }

  it("still flags an empty real distance and different values", () => {
    const empty = [...top, "Distance\t-\t55,00\t+", "parcourue (miles)", "Distance réelle\t---", "parcourue (km)", ...tail].join("\n");
    expect(workOrderIssues(parseExtractedText(empty)).map((i) => i.code)).toEqual(["km"]);
    const different = [...top, "Distance\t-\t55,00\t+", "parcourue (miles)", "Distance réelle\t24,00", "parcourue (km)", ...tail].join("\n");
    expect(workOrderIssues(parseExtractedText(different))).toEqual([{ code: "kmMismatch", miles: 55, km: 24 }]);
  });

  it("never takes the trip duration (40 minutes) for a distance", () => {
    const noDistances = [...top, "Distance", "parcourue (miles)", "Distance réelle", "parcourue (km)", ...tail].join("\n");
    const parsed = parseExtractedText(noDistances);
    expect(parsed.km_aller).toBeUndefined();
    expect(parsed.miles_traveled).toBeUndefined();
  });
});
