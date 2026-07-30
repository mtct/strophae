// The per-persona accents. Chromium supports oklch() natively, so the hues
// stored in the domain model become colour here without any conversion.
//
// These are poster inks, not screen colours: saturated, flat, and printed
// as solid fields (a spine, a swatch, a waiting square) on the white sheets
// of styles.css. Lightness follows the hue rather than sitting flat,
// because a pigment does: a poster yellow is light, a poster blue is dark.
// Flattening them to one lightness is what turns a primary into mud.

export const ACCENT_CHROMA = 0.19;

/** Shortest angular distance between two hues, in degrees (0…180). */
const arc = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180);

/** Light around yellow, dark everywhere else; the bump dies within a
    quadrant, so blues, violets and greens keep a common weight. */
export const accentLightness = (hue: number) =>
  0.52 + 0.31 * Math.exp(-(arc(hue, 95) ** 2) / (2 * 34 ** 2));

export const accent = (hue: number) =>
  `oklch(${accentLightness(hue).toFixed(3)} ${ACCENT_CHROMA} ${hue})`;
