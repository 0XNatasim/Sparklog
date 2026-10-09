import { describe, expect, it } from "vitest";
import { parseExtractedText } from "./work-order-parse";

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
