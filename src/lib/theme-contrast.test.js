import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Locks the WCAG contrast of the theme tokens in index.css, so a colour tweak cannot
// silently make error text, status badges or field borders unreadable again.
const css = readFileSync(fileURLToPath(new URL("../index.css", import.meta.url)), "utf8");

function tokens(block) {
  const map = {};
  for (const [, name, h, s, l] of block.matchAll(/--([\w-]+):\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%;/g)) {
    map[name] = [Number(h), Number(s), Number(l)];
  }
  return map;
}

const light = tokens(css.slice(css.indexOf(":root {"), css.indexOf(".dark {")));
const dark = { ...light, ...tokens(css.slice(css.indexOf(".dark {"))) };

function rgb([h, s, l]) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}
const luminance = (c) => {
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
// A colour at `alpha` over `under` (how bg-success/15 etc. render).
const tint = (color, under, alpha) => color.map((v, i) => alpha * v + (1 - alpha) * under[i]);

const COLORED = ["primary", "destructive", "success", "warning", "info"];

describe.each([["light", light], ["dark", dark]])("%s theme contrast", (_, t) => {
  const bg = rgb(t.background);
  const card = rgb(t.card);

  it.each(COLORED)("%s text is readable on the page, cards and its own 15% tint", (name) => {
    const color = rgb(t[name]);
    expect(contrast(color, bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color, card)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color, tint(color, card, 0.15))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(COLORED)("%s-foreground is readable on a solid %s background", (name) => {
    expect(contrast(rgb(t[`${name}-foreground`]), rgb(t[name]))).toBeGreaterThanOrEqual(4.5);
  });

  it("body and muted text are readable", () => {
    expect(contrast(rgb(t.foreground), bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(rgb(t["muted-foreground"]), bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("form field borders reach 3:1 (WCAG 1.4.11)", () => {
    expect(contrast(rgb(t.input), bg)).toBeGreaterThanOrEqual(3);
    expect(contrast(rgb(t.input), card)).toBeGreaterThanOrEqual(3);
  });
});
