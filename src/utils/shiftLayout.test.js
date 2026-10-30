// Run: node --test src/utils/shiftLayout.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toMinutes, fmtMinutes, shiftSpan, templateSpan, axisRange, layoutShifts,
  shiftDuration, crossesMidnight, shiftTimeError, dayNumber, groupDaysIntoBlocks, buildTimeScale, DAY_MIN,
} from './shiftLayout.js';

const s = (id, start_time, end_time) => ({ id, start_time, end_time });

test('toMinutes / fmtMinutes', () => {
  assert.equal(toMinutes('16:30'), 990);
  assert.equal(toMinutes('16:30:00'), 990);
  assert.equal(toMinutes(''), null);
  assert.equal(toMinutes(null), null);
  assert.equal(fmtMinutes(990), '16:30');
  assert.equal(fmtMinutes(25 * 60), '01:00');
});

test('shiftSpan: open end, midnight crossing', () => {
  assert.deepEqual(shiftSpan(s(1, '16:00', '19:00')), { start: 960, end: 1140, openEnd: false });
  assert.deepEqual(shiftSpan(s(1, '16:00', null)), { start: 960, end: 1020, openEnd: true });
  assert.deepEqual(shiftSpan(s(1, '16:00', '16:00')), { start: 960, end: 1020, openEnd: true });
  assert.deepEqual(shiftSpan(s(1, '22:00', '01:00')), { start: 1320, end: 1500, openEnd: false });
  assert.equal(shiftSpan(s(1, 'x', '19:00')), null);
  assert.deepEqual(templateSpan('19:00-22:00'), { start: 1140, end: 1320, openEnd: false });
});

test('axisRange: floor/ceil to the hour, fallback, no 26 h clamp', () => {
  assert.deepEqual(axisRange([]), { start: 840, end: 1380 });
  assert.deepEqual(axisRange([{ start: 990, end: 1290 }]), { start: 960, end: 1320 });
  assert.deepEqual(axisRange([{ start: 1320, end: 1700 }]), { start: 1320, end: 1740 });
});

test('layoutShifts: positions relative to the axis start', () => {
  const [a, b] = layoutShifts([s('b', '19:00', '22:00'), s('a', '16:00', '19:00')], { axisStart: 900, hourHeight: 60 });
  assert.equal(a.shift.id, 'a');
  assert.equal(a.top, 60);
  assert.equal(a.height, 180);
  assert.deepEqual([a.lane, a.lanes, b.lane, b.lanes], [0, 1, 0, 1]); // touching shifts do not overlap
  assert.equal(b.top, 240);
});

test('layoutShifts: overlapping cluster shares lanes, next cluster starts fresh', () => {
  const out = layoutShifts([
    s('a', '16:00', '19:00'),
    s('b', '17:00', '18:00'),
    s('c', '18:30', '20:00'), // overlaps a → reuses lane of b
    s('d', '21:00', '22:00'), // separate cluster
  ], { axisStart: 960 });
  const by = Object.fromEntries(out.map((o) => [o.shift.id, o]));
  assert.deepEqual([by.a.lane, by.b.lane, by.c.lane], [0, 1, 1]);
  assert.deepEqual([by.a.lanes, by.b.lanes, by.c.lanes], [2, 2, 2]);
  assert.deepEqual([by.d.lane, by.d.lanes], [0, 1]);
});

test('layoutShifts: minimum height, unparseable rows skipped', () => {
  const out = layoutShifts([s('a', '16:00', '16:15'), s('x', '', '')], { axisStart: 960, hourHeight: 56, minHeight: 28 });
  assert.equal(out.length, 1);
  assert.equal(out[0].height, 28);
});

test('shiftDuration / crossesMidnight / shiftTimeError', () => {
  assert.equal(shiftDuration('16:00', '19:00'), 180);
  assert.equal(shiftDuration('22:00', '02:00'), 240);
  assert.equal(shiftDuration('22:00', '22:00'), 0);
  assert.equal(shiftDuration('x', '02:00'), null);
  assert.equal(crossesMidnight('22:00', '03:00'), true);
  assert.equal(crossesMidnight('16:00', '19:00'), false);
  assert.equal(shiftTimeError('22:00', '03:00'), null);
  assert.equal(shiftTimeError('10:00', '22:00'), null); // exactly 12 h
  assert.equal(shiftTimeError('10:00', '22:01'), 'SLOT_TOO_LONG');
  assert.equal(shiftTimeError('20:00', '09:00'), 'SLOT_TOO_LONG');
  assert.equal(shiftTimeError('20:00', '20:00'), 'BAD_SLOT_TIME');
  assert.equal(shiftTimeError('', '20:00'), 'BAD_SLOT_TIME');
});

test('groupDaysIntoBlocks: adjacent, non-adjacent, month and year wrap, unsorted input', () => {
  const d = (id, date) => ({ id, date });
  const ids = (blocks) => blocks.map((b) => b.days.map((x) => x.id));
  assert.deepEqual(ids(groupDaysIntoBlocks([d('b', '2025-12-06'), d('a', '2025-12-05'), d('c', '2025-12-12'), d('e', '2025-12-14')])),
    [['a', 'b'], ['c'], ['e']]);
  assert.deepEqual(ids(groupDaysIntoBlocks([d('a', '2025-11-30'), d('b', '2025-12-01')])), [['a', 'b']]);
  assert.deepEqual(ids(groupDaysIntoBlocks([d('a', '2025-12-31'), d('b', '2026-01-01'), d('c', '2026-01-02')])), [['a', 'b', 'c']]);
  assert.deepEqual(ids(groupDaysIntoBlocks([d('a', '2024-02-28'), d('b', '2024-03-01')])), [['a'], ['b']]); // leap year: 29th missing
  assert.deepEqual(ids(groupDaysIntoBlocks([d('x', 'kaputt'), d('a', '2025-12-05')])), [['a'], ['x']]);
  assert.deepEqual(groupDaysIntoBlocks([]), []);
  assert.equal(dayNumber('2025-12-06') - dayNumber('2025-12-05'), 1);
});

test('layoutShifts: lanes across midnight with day offsets', () => {
  // Day 0: 22:00-02:00 (crosses midnight); day 1: 01:00-03:00 overlaps it, 14:00-18:00 is separate.
  const day = { a: 0, b: 1, c: 1 };
  const out = layoutShifts([s('a', '22:00', '02:00'), s('b', '01:00', '03:00'), s('c', '14:00', '18:00')], {
    offsetOf: (sh) => day[sh.id] * DAY_MIN, axisStart: 0, hourHeight: 60,
  });
  const by = Object.fromEntries(out.map((o) => [o.shift.id, o]));
  assert.deepEqual([by.a.start, by.a.end, by.a.nextDay], [1320, 1560, true]);
  assert.deepEqual([by.b.start, by.b.end, by.b.nextDay], [1500, 1620, false]);
  assert.deepEqual([by.a.lane, by.b.lane, by.a.lanes, by.b.lanes], [0, 1, 2, 2]);
  assert.deepEqual([by.c.lane, by.c.lanes], [0, 1]);
});

test('buildTimeScale: midnight-crossing shift is one block over the divider band', () => {
  const spans = [{ start: 16 * 60, end: 19 * 60 }, { start: 22 * 60, end: 26 * 60 }, { start: DAY_MIN + 14 * 60, end: DAY_MIN + 18 * 60 }];
  const sc = buildTimeScale({ dayCount: 2, spans, hourHeight: 60, bandHeight: 40, pauseHeight: 20, padBottom: 0 });
  assert.equal(sc.start, 960);
  assert.equal(sc.end, DAY_MIN + 18 * 60);
  assert.deepEqual(sc.bands.map((b) => [b.dayIndex, b.at]), [[0, 960], [1, DAY_MIN]]);
  // 16:00..24:00 linear (8 h = 480 px) after band 0 (40 px); midnight band at 520.
  assert.equal(sc.toY(960, 'start'), 40);
  assert.equal(sc.bands[1].y, 520);
  // The crossing shift 22:00-02:00 spans the band: 2 h before + band + 2 h after.
  const items = layoutShifts([s('x', '22:00', '02:00')], { toY: sc.toY, minHeight: 0 });
  assert.equal(items[0].top, 400);
  assert.equal(items[0].height, 120 + 40 + 120);
  // A shift ending exactly at midnight stops above the band, one starting at midnight below it.
  assert.equal(sc.toY(DAY_MIN, 'end'), 520);
  assert.equal(sc.toY(DAY_MIN, 'start'), 560);
});

test('buildTimeScale: long gaps collapse into a pause strip, short ones stay', () => {
  const spans = [{ start: 600, end: 720 }, { start: 840, end: 900 }, { start: 1200, end: 1320 }];
  const sc = buildTimeScale({ dayCount: 1, spans, hourHeight: 60, bandHeight: 40, pauseHeight: 20, padBottom: 0 });
  // 12:00-14:00 (2 h) stays linear, 15:00-20:00 (5 h) collapses.
  assert.deepEqual(sc.pauses.map((p) => [p.from, p.to, p.height]), [[900, 1200, 20]]);
  assert.equal(sc.toY(900), 40 + 300);
  assert.equal(sc.toY(1200), 40 + 300 + 20);
  assert.equal(sc.height, 40 + 300 + 20 + 120);
  assert.ok(!sc.hours.some((h) => h.min > 900 && h.min < 1200));
});

test('buildTimeScale: gap over midnight collapses after the band, empty days get room', () => {
  const spans = [{ start: 1080, end: 1320 }, { start: DAY_MIN + 840, end: DAY_MIN + 1080 }];
  const sc = buildTimeScale({ dayCount: 2, spans, hourHeight: 60, bandHeight: 40, pauseHeight: 20, padBottom: 0 });
  // 22:00-24:00 linear, band, 00:00-14:00 collapsed.
  assert.deepEqual(sc.pauses.map((p) => [p.from, p.to]), [[DAY_MIN, DAY_MIN + 840]]);
  // Empty last day: range extends to its midnight; empty first day: range starts at 00:00, 0 px between the bands.
  const tail = buildTimeScale({ dayCount: 2, spans: [{ start: 960, end: 1140 }], emptyDays: [1], bandHeight: 40, emptyHeight: 50 });
  assert.equal(tail.end, DAY_MIN);
  assert.equal(tail.bands[1].height, 90);
  const head = buildTimeScale({ dayCount: 2, spans: [{ start: DAY_MIN + 960, end: DAY_MIN + 1140 }], emptyDays: [0], bandHeight: 40, emptyHeight: 50, pauseHeight: 20 });
  assert.equal(head.start, 0);
  assert.equal(head.bands[1].y, 90);
  const none = buildTimeScale({ dayCount: 1, spans: [], emptyDays: [0], bandHeight: 40, emptyHeight: 50, padBottom: 0 });
  assert.equal(none.height, 90);
});

test('layoutShifts + buildTimeScale: open end (end == start) keeps +60 min', () => {
  const sc = buildTimeScale({ dayCount: 1, spans: [shiftSpan(s('o', '18:00', '18:00'))], hourHeight: 60, bandHeight: 40, padBottom: 0 });
  const [it] = layoutShifts([s('o', '18:00', '18:00')], { toY: sc.toY, minHeight: 0 });
  assert.equal(it.openEnd, true);
  assert.equal(it.height, 60);
  assert.equal(it.nextDay, false);
});

test('buildTimeScale: a day reached by a shift from the previous day is not empty', () => {
  // Day 0: 22:00-03:00, day 1 has no own shifts → no "Keine Schichten" room, the shift runs into day 1.
  const sc = buildTimeScale({ dayCount: 2, spans: [{ start: 1320, end: DAY_MIN + 180 }], emptyDays: [1], bandHeight: 40, emptyHeight: 50 });
  assert.equal(sc.bands[1].empty, false);
  assert.equal(sc.bands[1].height, 40);
  assert.equal(sc.hours.find((h) => h.min === DAY_MIN).belowBand, true);
});
