// Web app entry points and the Google Calendar calls. The scheduling rules
// themselves live in Slots.js; settings live in Config.js.

// Pages ---------------------------------------------------------------------

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.view === 'admin' || p.view === 'text') {
    if (!keyOk_(p.key)) return HtmlService.createHtmlOutput('Not found.');
    if (p.view === 'text') {
      var text = emailTextFor_(String(p.dates || '').split(','), Number(p.minutes) || 30,
        p.tz || CONFIG.TIMEZONE, p.link === '1');
      return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.TEXT);
    }
    return page_('Admin', 'Scheduler admin', { key: p.key, bookingUrl: bookingUrl_(), zoom: zoomLink_() });
  }
  return page_('Book', 'Book a time with ' + CONFIG.OWNER_NAME, { startType: p.type || '' });
}

function page_(file, title, extra) {
  var t = HtmlService.createTemplateFromFile(file);
  var boot = Object.assign({
    name: CONFIG.OWNER_NAME,
    intro: CONFIG.INTRO,
    timezone: CONFIG.TIMEZONE,
    types: CONFIG.MEETING_TYPES,
    maxDaysAhead: CONFIG.MAX_DAYS_AHEAD,
    openDays: Object.keys(CONFIG.HOURS).map(Number)
  }, extra);
  t.boot = JSON.stringify(boot).replace(/</g, '\\u003c');
  return t.evaluate()
    .setTitle(title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include_(file) {
  return HtmlService.createHtmlOutputFromFile(file).getContent();
}

// Public calls from the booking page ----------------------------------------

function getSlots(typeId, fromDate, toDate) {
  var type = typeById_(typeId);
  if (!isDate_(fromDate) || !isDate_(toDate)) throw new Error('Bad date range.');
  return openSlots_(type, fromDate, toDate);
}

function book(form) {
  form = form || {};
  if (form.website) return { ok: true };  // hidden field only bots fill in
  var type = typeById_(form.type);
  var start = Number(form.start);
  var name = String(form.name || '').trim().slice(0, 100);
  var email = String(form.email || '').trim().toLowerCase().slice(0, 200);
  var note = String(form.note || '').trim().slice(0, 1500);
  if (!start || !name) return { ok: false, message: 'Please add your name.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: 'Please check your email address.' };

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var day = localDate_(start, offset_);
    if (openSlots_(type, day, day).indexOf(start) < 0) {
      return { ok: false, taken: true, message: 'That time was just taken. Please pick another.' };
    }
    var now = Date.now();
    var held = bookings_(now, now + (CONFIG.MAX_DAYS_AHEAD + 1) * DAY_).filter(function (ev) {
      return (ev.attendees || []).some(function (a) { return String(a.email).toLowerCase() === email; });
    });
    if (held.length >= CONFIG.MAX_UPCOMING_PER_GUEST) {
      return { ok: false, message: 'You already have ' + held.length + ' upcoming meetings booked. Please reach out by email to add another.' };
    }

    var end = start + type.minutes * MINUTE_;
    var zoom = zoomLink_();
    var ev = {
      summary: name + ' and ' + CONFIG.OWNER_NAME,
      description: (zoom ? 'Join on Zoom: ' + zoom + '\n\n' : '') +
        type.title + ', booked through the scheduling page.' +
        (note ? '\n\nNote from ' + name + '\n' + note : ''),
      start: { dateTime: new Date(start).toISOString(), timeZone: CONFIG.TIMEZONE },
      end: { dateTime: new Date(end).toISOString(), timeZone: CONFIG.TIMEZONE },
      attendees: [{ email: email, displayName: name }],
      extendedProperties: { private: { scheduler: 'booking' } }
    };
    if (zoom) ev.location = zoom;
    if (CONFIG.ADD_GOOGLE_MEET) {
      ev.conferenceData = {
        createRequest: { requestId: Utilities.getUuid(), conferenceSolutionKey: { type: 'hangoutsMeet' } }
      };
    }
    var made = Calendar.Events.insert(ev, CONFIG.HOST_CALENDAR, { sendUpdates: 'all', conferenceDataVersion: 1 });
    return { ok: true, start: start, end: end, meet: made.hangoutLink || '', zoom: zoom };
  } finally {
    lock.releaseLock();
  }
}

// Admin calls (need the admin key) ------------------------------------------

function adminEmailText(key, dates, minutes, tz, withLink) {
  if (!keyOk_(key)) throw new Error('Not allowed.');
  return emailTextFor_(dates, Number(minutes) || 30, tz || CONFIG.TIMEZONE, !!withLink);
}

function adminSaveZoom(key, link) {
  if (!keyOk_(key)) throw new Error('Not allowed.');
  link = String(link || '').trim();
  if (link && !/^https:\/\/([a-z0-9-]+\.)*zoom\.us\/\S+$/i.test(link)) throw new Error('That doesn\u2019t look like a Zoom link.');
  PropertiesService.getScriptProperties().setProperty('ZOOM_LINK', link);
  return link;
}

function adminBookings(key) {
  if (!keyOk_(key)) throw new Error('Not allowed.');
  var now = Date.now();
  return bookings_(now, now + 90 * DAY_).map(function (ev) {
    var guest = (ev.attendees || [])[0] || {};
    return {
      start: Date.parse(ev.start.dateTime),
      end: Date.parse(ev.end.dateTime),
      guest: guest.displayName || guest.email || '',
      email: guest.email || '',
      status: guest.responseStatus || '',
      link: ev.htmlLink
    };
  });
}

// Run once from the Apps Script editor: grants calendar access and makes
// the admin key. The admin link is printed in the execution log.
function setup() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ADMIN_KEY')) props.setProperty('ADMIN_KEY', Utilities.getUuid().replace(/-/g, ''));
  var now = Date.now();
  busy_(now, now + DAY_);
  bookings_(now, now + DAY_);
  var url = ScriptApp.getService().getUrl();
  console.log('Calendars readable: ' + CONFIG.BUSY_CALENDARS.join(', '));
  if (!zoomLink_() && !CONFIG.ADD_GOOGLE_MEET) console.warn('No Zoom link yet: set it on the admin page.');
  console.log('Admin key: ' + props.getProperty('ADMIN_KEY'));
  if (url) console.log('Admin page: ' + url + '?view=admin&key=' + props.getProperty('ADMIN_KEY'));
}

// Internals -----------------------------------------------------------------

function zoomLink_() {
  return PropertiesService.getScriptProperties().getProperty('ZOOM_LINK') || '';
}

function bookingUrl_() {
  return CONFIG.PUBLIC_URL || ScriptApp.getService().getUrl();
}

function keyOk_(key) {
  var k = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  return !!k && key === k;
}

function isDate_(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s));
}

function typeById_(id) {
  var t = CONFIG.MEETING_TYPES.filter(function (x) { return x.id === String(id); })[0];
  if (!t) throw new Error('Unknown meeting type.');
  return t;
}

// Host zone offset in minutes at an instant, from the "-0700" pattern.
function offset_(ms) {
  var z = Utilities.formatDate(new Date(ms), CONFIG.TIMEZONE, 'Z');
  var mins = parseInt(z.slice(1, 3), 10) * 60 + parseInt(z.slice(3, 5), 10);
  return z.charAt(0) === '-' ? -mins : mins;
}

function parts_(ms, tz) {
  var p = Utilities.formatDate(new Date(ms), tz, 'yyyy-MM-dd|EEEE|MMMM|d|H|m').split('|');
  return { date: p[0], weekday: p[1], month: p[2], day: Number(p[3]), h: Number(p[4]), min: Number(p[5]) };
}

// Busy intervals across every calendar in BUSY_CALENDARS. Fails closed: if a
// calendar can't be read, nothing is offered rather than offering times
// that might clash.
function busy_(fromMs, toMs) {
  var res = Calendar.Freebusy.query({
    timeMin: new Date(fromMs).toISOString(),
    timeMax: new Date(toMs).toISOString(),
    items: CONFIG.BUSY_CALENDARS.map(function (id) { return { id: id }; })
  });
  var out = [];
  CONFIG.BUSY_CALENDARS.forEach(function (id) {
    var cal = res.calendars[id];
    if (!cal || (cal.errors && cal.errors.length)) {
      console.error('Cannot read calendar ' + id + ': ' + JSON.stringify(cal && cal.errors));
      throw new Error('The calendar could not be checked just now. Please try again later.');
    }
    (cal.busy || []).forEach(function (b) { out.push([Date.parse(b.start), Date.parse(b.end)]); });
  });
  return out;
}

// Upcoming events created by this scheduler on the host calendar.
function bookings_(fromMs, toMs) {
  var items = [];
  var token;
  do {
    var r = Calendar.Events.list(CONFIG.HOST_CALENDAR, {
      timeMin: new Date(fromMs).toISOString(),
      timeMax: new Date(toMs).toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      privateExtendedProperty: 'scheduler=booking',
      maxResults: 250,
      pageToken: token
    });
    items = items.concat(r.items || []);
    token = r.nextPageToken;
  } while (token);
  return items.filter(function (ev) { return ev.status !== 'cancelled' && ev.start && ev.start.dateTime; });
}

// Dates that already hold MAX_BOOKINGS_PER_DAY bookings.
function fullDays_(fromMs, toMs) {
  var count = {};
  bookings_(fromMs, toMs).forEach(function (ev) {
    var d = localDate_(Date.parse(ev.start.dateTime), offset_);
    count[d] = (count[d] || 0) + 1;
  });
  var full = {};
  Object.keys(count).forEach(function (d) {
    if (count[d] >= CONFIG.MAX_BOOKINGS_PER_DAY) full[d] = true;
  });
  return full;
}

function openSlots_(type, fromDate, toDate) {
  var now = Date.now();
  var earliest = now + CONFIG.MIN_NOTICE_HOURS * 3600000;
  var latest = now + CONFIG.MAX_DAYS_AHEAD * DAY_;
  var fromMs = Math.max(wallTime_(fromDate, 0, offset_), earliest);
  var toMs = Math.min(wallTime_(addDays_(toDate, 1), 0, offset_), latest);
  if (toMs <= fromMs) return [];
  var windows = freeWindows_({
    dates: dateRange_(localDate_(fromMs, offset_), localDate_(toMs, offset_)),
    hours: CONFIG.HOURS,
    busy: busy_(fromMs, toMs),
    bufferMin: CONFIG.BUFFER_MINUTES,
    earliest: fromMs,
    latest: toMs,
    offsetFn: offset_,
    skipDates: fullDays_(fromMs, toMs)
  });
  return slotStarts_(windows, type.minutes, CONFIG.SLOT_STEP_MINUTES, offset_);
}

// Availability text for hand-picked dates. Notice and horizon limits don't
// apply here (Tim is choosing the dates), but anything already past does.
function emailTextFor_(dates, minutes, tz, withLink) {
  dates = dates.filter(isDate_).sort();
  if (!dates.length) throw new Error('Pick at least one date.');
  if (!/^[A-Za-z]+(\/[A-Za-z0-9_+-]+)*$/.test(tz)) throw new Error('Unknown time zone.');
  var fromMs = Math.max(wallTime_(dates[0], 0, offset_), Date.now());
  var toMs = wallTime_(addDays_(dates[dates.length - 1], 1), 0, offset_);
  if (toMs - fromMs > 62 * DAY_) throw new Error('Pick dates within about two months of each other.');
  if (toMs <= fromMs) return emailText_([], tz, parts_, '');
  var windows = freeWindows_({
    dates: dates,
    hours: CONFIG.HOURS,
    busy: busy_(fromMs, toMs),
    bufferMin: CONFIG.BUFFER_MINUTES,
    earliest: fromMs,
    latest: toMs,
    offsetFn: offset_,
    skipDates: fullDays_(fromMs, toMs)
  });
  windows = tidyWindows_(windows, minutes, CONFIG.EMAIL_GRID_MINUTES, offset_);
  return emailText_(windows, tz, parts_, withLink ? bookingUrl_() : '');
}
