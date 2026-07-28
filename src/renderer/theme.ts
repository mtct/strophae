// The prototype's visual identity. Chromium supports oklch() natively, so
// the accents are the exact oklch values from the original design — no
// colour-space conversion needed.

export const ACCENT_CHROMA = 0.15;

export const accent = (hue: number) =>
  `oklch(0.58 ${ACCENT_CHROMA} ${hue})`;

export const soft = (hue: number) =>
  `oklch(0.965 ${ACCENT_CHROMA * 0.3} ${hue})`;

export const headerBg = (hue: number) =>
  `oklch(0.992 ${ACCENT_CHROMA * 0.12} ${hue})`;
