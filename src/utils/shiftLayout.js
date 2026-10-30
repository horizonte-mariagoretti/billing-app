// Pure layout helpers for the shift calendar (Glühwein / Baseball "Schichten").
// Times are "HH:MM" strings; everything is computed in minutes since midnight.
// Consecutive Verkaufstage form one block with one continuous time line: day i of a block starts at
// i * 1440 minutes ("absolute minutes"), so a shift crossing midnight is one span on that line.

export const DAY_MIN = 24 * 60;
export const MAX_SHIFT_MIN = 12 * 60; // longest allowed shift
const MIN_DURATION = 60; // assumed length of a shift without a (valid) end
const FALLBACK = { start: 14 * 60, end: 23 * 60 };

/** "HH:MM" (or "HH:MM:SS") → minutes since midnight; null when not parseable. */
export function toMinutes(t) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
}

/** Minutes → "HH:MM" (wraps past midnight, 25:00 → "01:00"). */
export function fmtMinutes(min) {
  const v = ((Math.round(min) % DAY_MIN) + DAY_MIN) % DAY_MIN;
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
}

/**
 * Start/end of a shift in minutes.
 * - end missing or equal to start → start + 60, openEnd = true
 * - end before start (crosses midnight) → end + 24 h
 * Returns null when the start cannot be parsed.
 */
export function shiftSpan(shift) {
  const start = toMinutes(shift?.start_time);
  if (start == null) return null;
  let end = toMinutes(shift?.end_time);
  let openEnd = false;
  if (end == null || end === start) {
    end = start + MIN_DURATION;
    openEnd = true;
  } else if (end < start) {
    end += DAY_MIN;
  }
  return { start, end, openEnd };
}

/** Span of a "HH:MM-HH:MM" template, same rules as shiftSpan. */
export function templateSpan(tpl) {
  const [s, e] = String(tpl ?? '').split('-');
  return shiftSpan({ start_time: s, end_time: e });
}

/** Length of a shift in minutes (end before start = next day); 0 when end == start, null when not parseable. */
export function shiftDuration(start, end) {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s == null || e == null || s >= DAY_MIN || e >= DAY_MIN) return null;
  return e >= s ? e - s : e + DAY_MIN - s;
}

/** True when the shift ends on the following day. */
export function crossesMidnight(start, end) {
  const s = toMinutes(start);
  const e = toMinutes(end);
  return s != null && e != null && e < s;
}

/**
 * Validates the times of a shift entered by hand.
 * Returns null when valid, else 'BAD_SLOT_TIME' (not parseable / zero length) or 'SLOT_TOO_LONG' (> 12 h).
 */
export function shiftTimeError(start, end) {
  const d = shiftDuration(start, end);
  if (d == null || d === 0) return 'BAD_SLOT_TIME';
  if (d > MAX_SHIFT_MIN) return 'SLOT_TOO_LONG';
  return null;
}

/**
 * Visible time range of a single day: earliest start floored to the hour .. latest end ceiled to the hour.
 * Falls back to 14:00–23:00 when nothing is known.
 */
export function axisRange(spans) {
  const list = (spans || []).filter(Boolean);
  if (!list.length) return { ...FALLBACK };
  let start = Math.floor(Math.min(...list.map((s) => s.start)) / 60) * 60;
  let end = Math.ceil(Math.max(...list.map((s) => s.end)) / 60) * 60;
  start = Math.max(0, start);
  end = Math.max(end, start + 60);
  return { start, end };
}

/** "YYYY-MM-DD" → day number (UTC days since epoch); null when not a date. */
export function dayNumber(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(ms) ? null : Math.round(ms / 86400000);
}

/**
 * Groups Verkaufstage into blocks of consecutive calendar days (sorted by date).
 * A lone day is a block of one; days with an unparseable date each get their own block at the end.
 * @returns {Array<{ days: Array }>}
 */
export function groupDaysIntoBlocks(days) {
  const valid = [];
  const invalid = [];
  (days || []).forEach((d) => {
    const n = dayNumber(d?.date);
    if (n == null) invalid.push(d); else valid.push({ d, n });
  });
  valid.sort((a, b) => a.n - b.n);
  const blocks = [];
  let prev = null;
  for (const { d, n } of valid) {
    if (prev != null && n === prev + 1) blocks[blocks.length - 1].days.push(d);
    else if (prev == null || n !== prev) blocks.push({ days: [d] });
    else blocks[blocks.length - 1].days.push(d); // same date twice: keep together
    prev = n;
  }
  invalid.forEach((d) => blocks.push({ days: [d] }));
  return blocks;
}

const floorHour = (m) => Math.floor(m / 60) * 60;
const ceilHour = (m) => Math.ceil(m / 60) * 60;

/** Merges [start, end] intervals (sorted, overlapping/touching ones joined). */
function mergeIntervals(list) {
  const sorted = list.filter((s) => s && s.end > s.start).map((s) => ({ start: s.start, end: s.end }))
    .sort((a, b) => a.start - b.start);
  const out = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else out.push(s);
  }
  return out;
}

/**
 * Vertical time scale of one block of consecutive days.
 *
 * - Range: earliest start (floored to the hour) .. latest end (ceiled); a block whose first day is empty starts
 *   at 00:00 of that day, an empty last day extends the range to its midnight.
 * - Every day gets a band (day row: label + actions) of `bandHeight` px; day 0 at the top of the range, day i
 *   at its midnight (i * 1440). An empty day's band is `emptyHeight` px taller (room for "Keine Schichten");
 *   a day listed in `emptyDays` that a shift from the previous day reaches into does not count as empty.
 * - Gaps without shifts longer than `pauseMinGap` minutes collapse into a `pauseHeight` px strip
 *   (0 px between two bands, i.e. inside an empty day).
 *
 * @param {{ dayCount: number, spans: Array<{start:number,end:number}>, emptyDays?: Set<number>|number[],
 *   hourHeight?: number, bandHeight?: number, emptyHeight?: number, pauseHeight?: number, pauseMinGap?: number,
 *   padBottom?: number }} opts  spans in absolute minutes
 * @returns {{ start, end, height, bands: Array<{dayIndex, at, y, height, empty}>, pauses: Array<{from, to, y, height}>,
 *   hours: Array<{min, y, belowBand}>, toY: (min: number, side?: 'start'|'end') => number }}
 */
export function buildTimeScale({
  dayCount, spans, emptyDays = [], hourHeight = 56, bandHeight = 44, emptyHeight = 56,
  pauseHeight = 24, pauseMinGap = 180, padBottom = 10,
}) {
  const n = Math.max(1, dayCount || 1);
  const covered = mergeIntervals(spans || []);
  // A day without own shifts only counts as empty when no shift (e.g. one continuing past midnight) reaches into it.
  const empty = new Set([...emptyDays].filter((i) => !covered.some((c) => c.end > i * DAY_MIN && c.start < (i + 1) * DAY_MIN)));

  let start;
  let end;
  if (!covered.length) {
    start = 0;
    end = (n - 1) * DAY_MIN;
  } else {
    start = empty.has(0) ? 0 : floorHour(covered[0].start);
    end = Math.max(ceilHour(covered[covered.length - 1].end), (n - 1) * DAY_MIN);
  }

  const bandAt = (i) => (i === 0 ? start : i * DAY_MIN);
  const bandsIn = [];
  for (let i = 0; i < n; i += 1) bandsIn.push({ dayIndex: i, at: bandAt(i), empty: empty.has(i) });

  // Uncovered gaps in [from, to]; ends touching a band stay exact, others are rounded inwards to the hour.
  const gapsBetween = (from, to, fromBand, toBand) => {
    const gaps = [];
    let cursor = from;
    for (const c of covered) {
      if (c.end <= from || c.start >= to) continue;
      if (c.start > cursor) gaps.push([cursor, c.start]);
      cursor = Math.max(cursor, c.end);
    }
    if (cursor < to) gaps.push([cursor, to]);
    return gaps.map(([a, b]) => {
      const atFrom = a === from && fromBand;
      const atTo = b === to && toBand;
      const a2 = atFrom ? a : ceilHour(a);
      const b2 = atTo ? b : floorHour(b);
      return { from: a2, to: b2, betweenBands: atFrom && atTo };
    }).filter((g) => g.to - g.from > pauseMinGap);
  };

  // Pieces in order: band | linear | pause.
  const pieces = [];
  let y = 0;
  const pushLinear = (from, to) => {
    if (to <= from) return;
    const h = ((to - from) / 60) * hourHeight;
    pieces.push({ kind: 'linear', from, to, y, height: h });
    y += h;
  };
  bandsIn.forEach((b, idx) => {
    const h = bandHeight + (b.empty ? emptyHeight : 0);
    pieces.push({ kind: 'band', ...b, y, height: h });
    y += h;
    const segEnd = idx + 1 < bandsIn.length ? bandsIn[idx + 1].at : end;
    const hasNextBand = idx + 1 < bandsIn.length;
    let cursor = b.at;
    for (const g of gapsBetween(b.at, segEnd, true, hasNextBand)) {
      pushLinear(cursor, g.from);
      const ph = g.betweenBands ? 0 : pauseHeight;
      pieces.push({ kind: 'pause', from: g.from, to: g.to, y, height: ph });
      y += ph;
      cursor = g.to;
    }
    pushLinear(cursor, segEnd);
  });
  const height = y + padBottom;

  const bands = pieces.filter((p) => p.kind === 'band')
    .map(({ dayIndex, at, y: by, height: bh, empty: e }) => ({ dayIndex, at, y: by, height: bh, empty: e }));
  const pauses = pieces.filter((p) => p.kind === 'pause' && p.height > 0)
    .map(({ from, to, y: py, height: ph }) => ({ from, to, y: py, height: ph }));

  const toY = (min, side = 'start') => {
    const band = bands.find((b) => b.at === min);
    if (band) return side === 'end' && min !== start ? band.y : band.y + band.height;
    for (const p of pieces) {
      if (p.kind === 'linear' && min >= p.from && min <= p.to) return p.y + ((min - p.from) / 60) * hourHeight;
      if (p.kind === 'pause' && min > p.from && min < p.to) {
        return p.y + (p.height * (min - p.from)) / (p.to - p.from);
      }
    }
    if (min < start) return bands[0].y + bands[0].height;
    return y;
  };

  const hours = [];
  const seen = new Set();
  pieces.filter((p) => p.kind === 'linear').forEach((p) => {
    for (let m = ceilHour(p.from); m <= p.to; m += 60) {
      if (seen.has(m)) continue;
      seen.add(m);
      hours.push({ min: m, y: toY(m, 'start'), belowBand: bands.some((b) => b.at === m) });
    }
  });

  return { start, end, height, bands, pauses, hours, toY };
}

/**
 * Positions shifts on the time axis.
 * Overlapping shifts share the column width: each transitively overlapping cluster gets as many lanes as it
 * needs (greedy, sorted by start), every shift sits in one lane.
 *
 * @param {Array} shifts  rows with start_time / end_time
 * @param {{ axisStart?: number, hourHeight?: number, minHeight?: number,
 *   offsetOf?: (shift) => number, toY?: (min: number, side: 'start'|'end') => number }} opts
 *   offsetOf: absolute minute offset of the shift's day (day index * 1440); toY: custom scale (buildTimeScale)
 * @returns {Array<{ shift, start, end, openEnd, nextDay, top, height, lane, lanes }>}  start/end absolute
 */
export function layoutShifts(shifts, {
  axisStart = 0, hourHeight = 56, minHeight = 28, offsetOf = () => 0, toY = null,
} = {}) {
  const items = (shifts || [])
    .map((shift) => {
      const span = shiftSpan(shift);
      if (!span) return null;
      const off = Number(offsetOf(shift)) || 0;
      return { shift, span: { ...span, start: span.start + off, end: span.end + off, nextDay: span.end > DAY_MIN } };
    })
    .filter(Boolean)
    .sort((a, b) => a.span.start - b.span.start || b.span.end - a.span.end);

  const out = [];
  let cluster = [];
  let clusterEnd = -Infinity;
  let laneEnds = [];

  const flush = () => {
    const lanes = Math.max(1, laneEnds.length);
    cluster.forEach((c) => { c.lanes = lanes; out.push(c); });
    cluster = [];
    laneEnds = [];
  };

  for (const { shift, span } of items) {
    if (cluster.length && span.start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((e) => e <= span.start);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(span.end); } else laneEnds[lane] = span.end;
    clusterEnd = cluster.length ? Math.max(clusterEnd, span.end) : span.end;
    const top = toY ? toY(span.start, 'start') : ((span.start - axisStart) / 60) * hourHeight;
    const rawHeight = toY ? toY(span.end, 'end') - top : ((span.end - span.start) / 60) * hourHeight;
    cluster.push({
      shift,
      start: span.start,
      end: span.end,
      openEnd: span.openEnd,
      nextDay: span.nextDay,
      top,
      height: Math.max(minHeight, rawHeight),
      lane,
      lanes: 1,
    });
  }
  if (cluster.length) flush();
  return out;
}
