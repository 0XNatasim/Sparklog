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
