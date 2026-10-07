// Settings for the scheduler. Edit here, then push the project again
// (see README). Times are in TIMEZONE unless noted.

var CONFIG = {
  OWNER_NAME: 'Tim Thomas',
  INTRO: 'Pick a time that works for you. A calendar invitation will arrive by email.',
  TIMEZONE: 'America/Los_Angeles',

  // A time is open only when every one of these calendars is free.
  BUSY_CALENDARS: ['timthomas@berkeley.edu', 'tim@cidrlab.org'],

  // New bookings are created here, and Google sends the invitation from it.
  HOST_CALENDAR: 'timthomas@berkeley.edu',

  // Hours open for booking, by weekday (0 = Sunday, 6 = Saturday).
  // Leave a day out to close it.
  HOURS: {
    1: [['09:00', '12:00'], ['13:00', '17:00']],
    2: [['09:00', '12:00'], ['13:00', '17:00']],
    3: [['09:00', '12:00'], ['13:00', '17:00']],
    4: [['09:00', '12:00'], ['13:00', '17:00']],
    5: [['09:00', '12:00'], ['13:00', '16:00']]
  },

  // The meeting lengths people can choose from. id appears in links
  // (…/exec?type=30 opens the page on that length).
  MEETING_TYPES: [
    { id: '15', title: 'Quick check-in', minutes: 15 },
    { id: '30', title: '30-minute meeting', minutes: 30 },
    { id: '60', title: '1-hour meeting', minutes: 60 }
  ],

  // Where meetings happen. The Zoom link is set on the admin page and kept
  // in the script's private properties, never in this file, because the repo
  // is public and the link carries the room passcode. It goes in every
  // invitation and on the confirmation screen. ADD_GOOGLE_MEET attaches a
  // Google Meet link as well, if wanted.
  ADD_GOOGLE_MEET: false,

  // The address people use: the GitHub Pages page that shows this app.
  // Used for the booking link in availability text and on the admin page.
  PUBLIC_URL: 'https://timathomas.github.io/scheduler/',

  SLOT_STEP_MINUTES: 30,        // offered start times fall on this grid
  BUFFER_MINUTES: 10,           // kept clear before and after other events
  MIN_NOTICE_HOURS: 24,         // nothing bookable sooner than this
  MAX_DAYS_AHEAD: 30,           // nothing bookable further out than this
  MAX_BOOKINGS_PER_DAY: 4,      // counts only bookings made through this page
  MAX_UPCOMING_PER_GUEST: 2,    // one email address can hold this many at once

  // For the email-availability text: windows are trimmed to this grid
  // so they read as 10–11:30 am rather than 10:10–11:20 am.
  EMAIL_GRID_MINUTES: 15
};
