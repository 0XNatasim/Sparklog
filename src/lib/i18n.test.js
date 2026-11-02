import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dictionaries } from "./i18n";
import { getEnglish, loadEnglish } from "./i18n-loader";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const walk = (dir) => readdirSync(new URL(dir, import.meta.url), { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? walk(`${dir}${entry.name}/`) : [`${dir}${entry.name}`]);

describe("French first, English on demand", () => {
  it("both languages hold exactly the same keys (use-t no longer falls back to English)", () => {
    const en = Object.keys(dictionaries.en).sort();
    const fr = Object.keys(dictionaries.fr).sort();
    expect(en.filter((key) => !(key in dictionaries.fr))).toEqual([]);
    expect(fr.filter((key) => !(key in dictionaries.en))).toEqual([]);
  });

  it("no string is empty in either language", () => {
    for (const lang of ["en", "fr"]) {
      const empty = Object.entries(dictionaries[lang]).filter(([, value]) => typeof value !== "string" || value === "");
      expect(empty.map(([key]) => `${lang}:${key}`)).toEqual([]);
    }
  });

  it("the app never imports the English dictionary statically (it would end up in the main bundle)", () => {
    const offenders = walk("../")
      .filter((file) => /\.(jsx?|tsx?)$/.test(file) && !/\.test\./.test(file))
      .filter((file) => !file.endsWith("lib/i18n.js")) // tests-and-tools aggregate, not used by the app
      .filter((file) => /from\s+["'](?:@\/lib|\.\/|\.\.\/lib\/)i18n-en["']/.test(read(file)) || /from\s+["']@\/lib\/i18n["']/.test(read(file)));
    expect(offenders).toEqual([]);
  });

  it("English loads as its own module and French stays the base text", async () => {
    expect(getEnglish()).toBeNull();
    const en = await loadEnglish();
    expect(en["common.save"]).toBe(dictionaries.en["common.save"]);
    expect(getEnglish()).toBe(en);
    expect(dictionaries.fr["common.save"]).not.toBe(dictionaries.en["common.save"]);
  });

  it("French is the default language", () => {
    expect(read("../components/LanguageProvider.jsx")).toMatch(/return "fr";/);
    expect(read("../components/language-provider.jsx")).toContain('language: "fr"');
  });
});
