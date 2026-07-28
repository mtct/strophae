// The per-persona accents. Chromium supports oklch() natively, so the hues
// stored in the domain model become colour here without any conversion.
//
// The palette is deliberately inky rather than screen-bright: on the paper
// board of styles.css a saturated accent reads as plastic, while a darker,
// less chromatic value reads as pigment. Everything derived from an accent
// (a column's header wash, its waiting dots) is mixed in CSS from the
// --agent custom property each column sets.

export const ACCENT_CHROMA = 0.13;

export const accent = (hue: number) =>
  `oklch(0.53 ${ACCENT_CHROMA} ${hue})`;
