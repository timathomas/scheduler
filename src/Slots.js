// Scheduling logic with no Google services in it, so this file runs
// unchanged in Apps Script and in the Node tests (test/slots.test.js).
// Instants are epoch milliseconds; dates are 'YYYY-MM-DD' strings on the
// host's calendar. offsetFn(ms) gives the host zone's offset from UTC in
// minutes at that instant (-420 for Pacific daylight time).

var MINUTE_ = 60000;
var DAY_ = 86400000;

function parseHm_(s) {
  var p = s.split(':');
  return Number(p[0]) * 60 + Number(p[1]);
}

function addDays_(dateStr, n) {
  return new Date(Date.parse(dateStr + 'T00:00:00Z') + n * DAY_).toISOString().slice(0, 10);
}

function weekday_(dateStr) {
  return new Date(dateStr + 'T00:00:00Z').getUTCDay();
}

function dateRange_(from, to) {
  var out = [];
  for (var d = from; d <= to; d = addDays_(d, 1)) out.push(d);
  return out;
}

// The instant at which the host clock reads `minutes` past midnight on dateStr.
// The second offset lookup settles days when daylight time starts or ends.
function wallTime_(dateStr, minutes, offsetFn) {
  var guess = Date.parse(dateStr + 'T00:00:00Z') + minutes * MINUTE_;
  var first = guess - offsetFn(guess) * MINUTE_;
  return guess - offsetFn(first) * MINUTE_;
}

function localDate_(ms, offsetFn) {
  return new Date(ms + offsetFn(ms) * MINUTE_).toISOString().slice(0, 10);
}

// Pieces of window [start, end] left after removing every busy interval.
function subtract_(win, busy) {
  var pieces = [win];
  busy.forEach(function (b) {
    var next = [];
    pieces.forEach(function (p) {
      if (b[1] <= p[0] || b[0] >= p[1]) {
        next.push(p);
        return;
      }
      if (b[0] > p[0]) next.push([p[0], b[0]]);
      if (b[1] < p[1]) next.push([b[1], p[1]]);
    });
    pieces = next;
  });
  return pieces;
}

// Open time on each date: weekly hours, minus busy time padded by the
// buffer, clipped to [earliest, latest]. Dates in skipDates are closed.
function freeWindows_(o) {
  var pad = (o.bufferMin || 0) * MINUTE_;
  var busy = o.busy.map(function (b) { return [b[0] - pad, b[1] + pad]; });
  var out = [];
  o.dates.forEach(function (d) {
    if (o.skipDates && o.skipDates[d]) return;
    (o.hours[weekday_(d)] || []).forEach(function (r) {
      var s = Math.max(wallTime_(d, parseHm_(r[0]), o.offsetFn), o.earliest);
      var e = Math.min(wallTime_(d, parseHm_(r[1]), o.offsetFn), o.latest);
      if (e > s) out = out.concat(subtract_([s, e], busy));
    });
  });
  return out;
}

// Start times on the host clock grid where a meeting of durationMin fits.
function slotStarts_(windows, durationMin, stepMin, offsetFn) {
  var step = stepMin * MINUTE_;
  var dur = durationMin * MINUTE_;
  var out = [];
  windows.forEach(function (w) {
    var off = offsetFn(w[0]) * MINUTE_;
    for (var t = Math.ceil((w[0] + off) / step) * step - off; t + dur <= w[1]; t += step) out.push(t);
  });
  return out;
}

// Windows trimmed to the clock grid (starts up, ends down), keeping only
// those at least minMin long.
function tidyWindows_(windows, minMin, gridMin, offsetFn) {
  var grid = gridMin * MINUTE_;
  return windows.map(function (w) {
    var off = offsetFn(w[0]) * MINUTE_;
    return [Math.ceil((w[0] + off) / grid) * grid - off, Math.floor((w[1] + off) / grid) * grid - off];
  }).filter(function (w) {
    return w[1] - w[0] >= minMin * MINUTE_;
  });
}

// Paste-ready availability text --------------------------------------------

var ZONE_NAMES_ = {
  'America/Los_Angeles': 'Pacific time',
  'America/Denver': 'Mountain time',
  'America/Phoenix': 'Arizona time',
  'America/Chicago': 'Central time',
  'America/New_York': 'Eastern time',
  'America/Anchorage': 'Alaska time',
  'Pacific/Honolulu': 'Hawaii time',
  'UTC': 'UTC',
  'Etc/UTC': 'UTC'
};

function zoneLabel_(tz) {
  return ZONE_NAMES_[tz] || tz.split('/').pop().replace(/_/g, ' ') + ' time';
}

function clock_(h, m) {
  var h12 = h % 12 || 12;
  return m ? h12 + ':' + (m < 10 ? '0' : '') + m : String(h12);
}

// "10–11:30 am", "11 am–1 pm"
function rangeText_(a, b) {
  var ma = a.h < 12 ? 'am' : 'pm';
  var mb = b.h < 12 ? 'am' : 'pm';
  if (ma === mb) return clock_(a.h, a.min) + '–' + clock_(b.h, b.min) + ' ' + mb;
  return clock_(a.h, a.min) + ' ' + ma + '–' + clock_(b.h, b.min) + ' ' + mb;
}

function joinOr_(items) {
  if (items.length < 2) return items.join('');
  if (items.length === 2) return items[0] + ' or ' + items[1];
  return items.slice(0, -1).join(', ') + ', or ' + items[items.length - 1];
}

// partsFn(ms, tz) returns {date, weekday, month, day, h, min} on that zone's clock.
function emailText_(windows, tz, partsFn, link) {
  if (!windows.length) {
    return 'I don’t have open time on those dates. Could you suggest a few other days?';
  }
  var days = [];
  var byDate = {};
  windows.forEach(function (w) {
    var a = partsFn(w[0], tz);
    var b = partsFn(w[1], tz);
    if (!byDate[a.date]) {
      byDate[a.date] = { label: a.weekday + ', ' + a.month + ' ' + a.day, ranges: [] };
      days.push(byDate[a.date]);
    }
    byDate[a.date].ranges.push(rangeText_(a, b));
  });
  var lines = ['Here are some times that work for me (' + zoneLabel_(tz) + ').', ''];
  days.forEach(function (d) {
    lines.push('- ' + d.label + ', ' + joinOr_(d.ranges));
  });
  if (link) lines.push('', 'You can also book a time directly at ' + link);
  return lines.join('\n');
}

if (typeof module !== 'undefined') {
  module.exports = {
    addDays_: addDays_, dateRange_: dateRange_, wallTime_: wallTime_, localDate_: localDate_,
    subtract_: subtract_, freeWindows_: freeWindows_, slotStarts_: slotStarts_,
    tidyWindows_: tidyWindows_, emailText_: emailText_, rangeText_: rangeText_
  };
}
