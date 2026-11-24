// Finds the SELECTED radio buttons on a screenshot of the overtime confirmation form (Microsoft Forms, teal theme).
// OCR reads the text of each choice but not which circle is filled, so the picture itself is looked at: a selected radio button is a
// teal disc (ring + dot), an empty one is a grey ring. `data` = RGBA bytes (width × height × 4), as a JPEG decoder returns them.
// Returns the centres of the teal discs found in the left part of the picture, top to bottom: [{ x, y, size }].
// Pure and dependency free: shared by the Edge function `process_overtime_evidence` and the tests.
const isTeal = (r, g, b) => r < 90 && g > 90 && g < 190 && b > 90 && b < 190 && g - r > 50 && Math.abs(g - b) < 45;
// After the answer is sent (iPhone Safari: « Voici votre réponse enregistrée ! ») the form is read-only and the chosen circle is a
// FILLED light grey disc (≈ 189,189,189) while every other circle stays an empty ring on a white background.
const isGreyFill = (r, g, b) => Math.abs(r - g) < 8 && Math.abs(g - b) < 8 && r >= 176 && r <= 204;

export function findSelectedCircles({ width, height, data }) {
  if (!width || !height || !data || data.length < width * height * 4) return [];
  const teal = findDiscs({ width, height, data }, isTeal, { minFill: 0.15 });
  if (teal.length) return teal;
  // No teal circle: a read-only form? Only FILLED grey discs count (an empty ring has a low fill ratio, text is never a round blob).
  return findDiscs({ width, height, data }, isGreyFill, { minFill: 0.6, wholeOnly: true });
}

function findDiscs({ width, height, data }, colour, { minFill, wholeOnly = false }) {
  const xMax = Math.floor(width * 0.35); // the circles sit at the left edge, before their label
  const seen = new Uint8Array(width * height);
  const circles = [];
  const minSize = width * 0.008;
  const maxSize = width * 0.1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < xMax; x += 1) {
      const at = y * width + x;
      if (seen[at]) continue;
      const o = at * 4;
      if (!colour(data[o], data[o + 1], data[o + 2])) continue;
      // Flood fill of this teal blob (4-neighbours, iterative).
      let minX = x; let maxX = x; let minY = y; let maxY = y; let count = 0;
      const stack = [at];
      seen[at] = 1;
      while (stack.length) {
        const current = stack.pop();
        const cx = current % width;
        const cy = (current - cx) / width;
        count += 1;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        const near = [current - 1, current + 1, current - width, current + width];
        for (const next of near) {
          if (next < 0 || next >= seen.length || seen[next]) continue;
          const nx = next % width;
          if (nx >= xMax || Math.abs(nx - cx) > 1) continue;
          const p = next * 4;
          if (!colour(data[p], data[p + 1], data[p + 2])) continue;
          seen[next] = 1;
          stack.push(next);
        }
      }
      const w = maxX - minX + 1;
      const h = maxY - minY + 1;
      // A circle half hidden by the phone's bottom bar (or the browser header) is a flat blob: its width is still the diameter.
      // Its centre is then ambiguous (hidden at the bottom or at the top): both are given, the reader keeps the one that sits on a choice.
      const whole = w / h > 0.7 && w / h < 1.4 && h >= minSize;
      const clipped = !wholeOnly && !whole && w / h >= 1.4 && w / h < 3 && h >= w * 0.3 && h < w * 0.85;
      const sized = w >= minSize && w <= maxSize && h <= maxSize;
      const fill = count / (w * h);
      if (sized && (whole || clipped) && fill > minFill && fill < 0.98) {
        const circle = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, size: Math.max(w, h) };
        if (clipped) { circle.y = minY + w / 2; circle.altY = maxY - w / 2; }
        circles.push(circle);
      }
    }
  }
  // A selected radio button is a ring AND a dot: both are teal blobs with the same centre. Keep the larger one of each pair.
  const merged = [];
  for (const circle of circles.sort((a, b) => b.size - a.size)) {
    if (!merged.some((kept) => Math.hypot(kept.x - circle.x, kept.y - circle.y) < kept.size / 2)) merged.push(circle);
  }
  return merged.sort((a, b) => a.y - b.y);
}
