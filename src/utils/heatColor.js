// Heat scale for share bars (Horis Anteil, Lasagnen Anteil):
// soft red (lowest) -> yellow -> green (highest). rel = 0..1 position between min and max.
const HEAT_STOPS = [[0, [238, 112, 104]], [0.5, [252, 218, 108]], [1, [72, 187, 120]]];

export function heatColor(rel) {
  const r = Math.max(0, Math.min(1, Number(rel) || 0));
  const [a, b] = r <= 0.5 ? [HEAT_STOPS[0], HEAT_STOPS[1]] : [HEAT_STOPS[1], HEAT_STOPS[2]];
  const k = (r - a[0]) / (b[0] - a[0]);
  const c = a[1].map((v, i) => Math.round(v + (b[1][i] - v) * k));
  return `rgb(${c.join(',')})`;
}
