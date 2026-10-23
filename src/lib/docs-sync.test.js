import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { APP_VERSION } from "./version";

// README.md, NOOB.md and CLAUDE.md are updated together in every version (CLAUDE.md « Docs rule »):
// each one names the current version, so a PR that bumps APP_VERSION without the docs fails here.
const read = (name) => readFileSync(new URL(`../../${name}`, import.meta.url), "utf8");

describe("documentation kept in step with the app version", () => {
  for (const name of ["README.md", "NOOB.md", "CLAUDE.md"]) {
    it(`${name} names V${APP_VERSION}`, () => {
      expect(read(name)).toContain(`V${APP_VERSION}`);
    });
  }

  it("states the rule where the next change will read it", () => {
    expect(read("CLAUDE.md")).toContain("**Docs rule:**");
  });
});
