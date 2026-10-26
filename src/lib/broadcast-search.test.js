import { describe, expect, it } from "vitest";
import { matchesBroadcastSearch, matchesPickerSearch } from "./broadcast-search";

describe("Communications search", () => {
  const b = { body: "Réunion d'équipe vendredi à l'entrepôt" };
  it("finds a sent message by its text or a recipient, without accents", () => {
    expect(matchesBroadcastSearch(b, ["Zoé Tremblay"], "")).toBe(true);
    expect(matchesBroadcastSearch(b, ["Zoé Tremblay"], "reunion entrepot")).toBe(true);
    expect(matchesBroadcastSearch(b, ["Zoé Tremblay"], "zoe")).toBe(true);
    expect(matchesBroadcastSearch(b, ["Zoé Tremblay"], "samedi")).toBe(false);
  });

  it("finds an employee of the picker by name or e-mail", () => {
    const e = { full_name: "Éric Bédard", email: "eric@test.ca" };
    expect(matchesPickerSearch(e, "bedard")).toBe(true);
    expect(matchesPickerSearch(e, "test.ca")).toBe(true);
    expect(matchesPickerSearch(e, "zoe")).toBe(false);
  });
});
