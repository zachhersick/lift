// Small color helpers for canvas/SVG components that need real hex values.
const toRgb = (hex: string) => {
  const n = parseInt(hex.replace("#", "").slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const toHex = (rgb: number[]) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

/** `a` blended toward `b` by t (0 = a, 1 = b). */
export function mix(a: string, b: string, t: number) {
  const x = toRgb(a);
  const y = toRgb(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
}

/** Five steps from the background to the accent, for heatmaps. */
export function ramp(background: string, accent: string) {
  return [0.06, 0.3, 0.55, 0.8, 1].map((t) => mix(background, accent, t));
}
