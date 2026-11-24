import { describe, expect, it } from "vitest";
import { findSelectedCircles } from "../../supabase/functions/_shared/radio_circles.js";

// A synthetic RGBA picture: white background, grey rings (empty radio buttons) and teal discs (selected ones) at the left edge.
const W = 400;
const H = 600;
function picture(draw) {
  const data = new Uint8Array(W * H * 4).fill(255);
  const set = (x, y, [r, g, b]) => { const o = (y * W + x) * 4; data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255; };
  draw(set);
  return { width: W, height: H, data };
}
const disc = (set, cx, cy, radius, color) => {
  for (let y = -radius; y <= radius; y += 1) for (let x = -radius; x <= radius; x += 1) if (x * x + y * y <= radius * radius) set(cx + x, cy + y, color);
};
const ring = (set, cx, cy, radius, thickness, color) => {
  for (let y = -radius; y <= radius; y += 1) for (let x = -radius; x <= radius; x += 1) {
    const d = x * x + y * y;
    if (d <= radius * radius && d >= (radius - thickness) ** 2) set(cx + x, cy + y, color);
  }
};
const TEAL = [6, 122, 122];
const GREY = [90, 90, 90];
const WHITE = [255, 255, 255];

describe("findSelectedCircles", () => {
  it("finds the one selected radio button (teal ring + dot) among grey empty ones, once", () => {
    const pic = picture((set) => {
      for (const y of [100, 200, 400, 500]) ring(set, 30, y, 12, 2, GREY);
      ring(set, 30, 300, 12, 3, TEAL); // the selected one: ring …
      disc(set, 30, 300, 6, TEAL); // … and dot
    });
    const found = findSelectedCircles(pic);
    expect(found).toHaveLength(1);
    expect(Math.abs(found[0].y - 300)).toBeLessThanOrEqual(1);
  });

  it("finds a filled teal disc too, and several of them top to bottom", () => {
    const pic = picture((set) => { disc(set, 30, 450, 12, TEAL); disc(set, 30, 120, 12, TEAL); });
    expect(findSelectedCircles(pic).map((c) => Math.round(c.y))).toEqual([120, 450]);
  });

  it("ignores teal that is not a circle at the left edge (a bar, text, a button on the right) and an empty picture", () => {
    const pic = picture((set) => {
      for (let x = 20; x < 380; x += 1) for (let y = 50; y < 56; y += 1) set(x, y, TEAL); // a long bar
      disc(set, 340, 300, 12, TEAL); // right side
      disc(set, 30, 200, 1, TEAL); // a speck
      disc(set, 30, 400, 12, WHITE);
    });
    expect(findSelectedCircles(pic)).toEqual([]);
    expect(findSelectedCircles({ width: 0, height: 0, data: new Uint8Array() })).toEqual([]);
  });
});

describe("findSelectedCircles: real-world pictures", () => {
  it("finds a thin, anti-aliased ring (compressed screenshot) and a circle cut by the bottom bar", () => {
    const pic = picture((set) => {
      ring(set, 30, 200, 12, 1, TEAL); // thin ring only
      disc(set, 30, 300, 6, TEAL);
      // a circle whose lower part is hidden by a white bar
      disc(set, 30, 500, 12, TEAL);
      for (let y = 499; y < 530; y += 1) for (let x = 0; x < 100; x += 1) set(x, y, WHITE);
    });
    const found = findSelectedCircles(pic);
    expect(found.length).toBeGreaterThanOrEqual(2);
    const clipped = found.find((c) => c.altY !== undefined);
    expect(clipped).toBeTruthy();
    expect(Math.abs(clipped.y - 500)).toBeLessThanOrEqual(12);
  });
});

describe("findSelectedCircles: read-only form after sending (grey filled disc)", () => {
  const GREY_FILL = [189, 189, 189];
  const RING = [160, 160, 160];
  it("finds the filled grey disc among empty rings, and nothing when every circle is an empty ring", () => {
    const pic = picture((set) => {
      for (const y of [100, 200, 400, 500]) ring(set, 30, y, 12, 1, RING); // empty rings
      disc(set, 30, 300, 11, GREY_FILL); // the chosen one
    });
    const found = findSelectedCircles(pic);
    expect(found).toHaveLength(1);
    expect(Math.abs(found[0].y - 300)).toBeLessThanOrEqual(1);
    const none = picture((set) => { for (const y of [100, 200, 300]) ring(set, 30, y, 12, 1, RING); });
    expect(findSelectedCircles(none)).toEqual([]);
  });

  it("prefers the teal discs when there are some (grey is only for the read-only form)", () => {
    const pic = picture((set) => { disc(set, 30, 150, 11, TEAL); disc(set, 30, 350, 11, GREY_FILL); });
    expect(findSelectedCircles(pic).map((c) => Math.round(c.y))).toEqual([150]);
  });
});
