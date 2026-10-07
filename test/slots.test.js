// Run with: node --test test/
// Exercises Slots.js with Node's own time zone data standing in for
// Apps Script's Utilities.formatDate.

const test = require('node:test');
const assert = require('node:assert');
const S = require('../src/Slots.js');

const TZ = 'America/Los_Angeles';
const MIN = 60000;

function offsetIn(tz) {
  return function (ms) {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
      .formatToParts(new Date(ms)).find((p) => p.type === 'timeZoneName').value;  // "GMT-07:00"
    const m = name.match(/GMT([+-])(\d{2}):(\d{2})/);
    if (!m) return 0;
    const mins = Number(m[2]) * 60 + Number(m[3]);
    return m[1] === '-' ? -mins : mins;
  };
}

function parts(ms, tz) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
    hour: 'numeric', minute: 'numeric', hourCycle: 'h23'
  }).formatToParts(new Date(ms));
  const g = (t) => f.find((p) => p.type === t).value;
  const num = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(ms));
  return { date: num, weekday: g('weekday'), month: g('month'), day: Number(g('day')), h: Number(g('hour')), min: Number(g('minute')) };
}

const off = offsetIn(TZ);
const at = (iso) => Date.parse(iso);
const HOURS = { 2: [['09:00', '12:00'], ['13:00', '17:00']] };  // Tuesdays only

test('wall clock to instant, across both daylight-time edges', () => {
  assert.strictEqual(S.wallTime_('2026-10-13', 9 * 60, off), at('2026-10-13T09:00:00-07:00'));
  assert.strictEqual(S.wallTime_('2026-11-01', 9 * 60, off), at('2026-11-01T09:00:00-08:00'));
  assert.strictEqual(S.wallTime_('2027-03-14', 9 * 60, off), at('2027-03-14T09:00:00-07:00'));
  assert.strictEqual(S.localDate_(at('2026-10-13T23:30:00-07:00'), off), '2026-10-13');
});

test('busy time and buffer are removed from working hours', () => {
  const busy = [[at('2026-10-13T10:00:00-07:00'), at('2026-10-13T10:40:00-07:00')]];
  const w = S.freeWindows_({
    dates: ['2026-10-13', '2026-10-14'], hours: HOURS, busy, bufferMin: 10,
    earliest: 0, latest: Infinity, offsetFn: off
  });
  const iso = (ms) => new Date(ms).toISOString();
  assert.deepStrictEqual(w.map((x) => x.map(iso)), [
    ['2026-10-13T16:00:00.000Z', '2026-10-13T16:50:00.000Z'],  // 9:00–9:50
    ['2026-10-13T17:50:00.000Z', '2026-10-13T19:00:00.000Z'],  // 10:50–12:00
    ['2026-10-13T20:00:00.000Z', '2026-10-14T00:00:00.000Z']   // 1–5 pm; Wednesday closed
  ]);
});

test('slots sit on the clock grid and fit the meeting', () => {
  const w = [[at('2026-10-13T10:50:00-07:00'), at('2026-10-13T12:00:00-07:00')]];
  const s = S.slotStarts_(w, 30, 30, off);
  assert.deepStrictEqual(s, [at('2026-10-13T11:00:00-07:00'), at('2026-10-13T11:30:00-07:00')]);
  assert.deepStrictEqual(S.slotStarts_(w, 60, 30, off), [at('2026-10-13T11:00:00-07:00')]);
});

test('notice and horizon clip the day; skipped dates close it', () => {
  const base = { dates: ['2026-10-13'], hours: HOURS, busy: [], offsetFn: off, latest: Infinity };
  const w = S.freeWindows_({ ...base, earliest: at('2026-10-13T14:20:00-07:00') });
  assert.strictEqual(w.length, 1);
  assert.strictEqual(w[0][0], at('2026-10-13T14:20:00-07:00'));
  assert.deepStrictEqual(S.freeWindows_({ ...base, earliest: 0, skipDates: { '2026-10-13': true } }), []);
});

test('email text reads cleanly in the recipient zone', () => {
  const w = S.tidyWindows_([
    [at('2026-10-13T10:00:00-07:00'), at('2026-10-13T11:00:00-07:00')],
    [at('2026-10-13T12:05:00-07:00'), at('2026-10-13T17:00:00-07:00')],
    [at('2026-10-14T09:30:00-07:00'), at('2026-10-14T09:50:00-07:00')],  // too short once tidied
    [at('2026-10-14T10:50:00-07:00'), at('2026-10-14T12:00:00-07:00')]
  ], 30, 15, off);
  assert.strictEqual(S.emailText_(w, TZ, parts, 'https://example.org/book'), [
    'Here are some times that work for me (Pacific time).',
    '',
    '- Tuesday, October 13, 10–11 am or 12:15–5 pm',
    '- Wednesday, October 14, 11 am–12 pm',
    '',
    'You can also book a time directly at https://example.org/book'
  ].join('\n'));
  assert.match(S.emailText_(w, 'America/New_York', parts, ''), /Eastern time[\s\S]*1–2 pm or 3:15–8 pm/);
  assert.match(S.emailText_([], TZ, parts, ''), /don.t have open time/);
});
