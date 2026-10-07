# scheduler

A personal booking page in the spirit of cal.com, run as a Google Apps Script
web app under Tim's own Google account and shown at
<https://timathomas.github.io/scheduler/>. Visitors see open times (checked
against both the Berkeley and CiDR calendars), pick one, and Google sends them
a calendar invitation. A private admin page writes paste-ready "here are times
that work for me" text for hand-picked dates.

Nothing is hosted elsewhere and no data is stored outside Google Calendar:
each booking is an ordinary event on the host calendar, tagged so the
scheduler can find it.

## Files

- `src/Config.js` holds every setting: calendars, weekly hours, meeting
  lengths, buffer, notice, horizon, daily cap, and the public address.
- `src/Slots.js` holds the scheduling rules (no Google calls, so they are
  tested in Node).
- `src/Code.js` holds the web app entry points and the Calendar calls.
- `src/Book.html` is the public booking page; `src/Admin.html` is the private
  admin page; `src/Ui.html` holds the shared styles and helpers.
- `docs/index.html` is the GitHub Pages page that shows the app at the
  public address.
- `test/slots.test.js` tests the rules: `node --test test/`.

The Zoom link and the admin key are kept in the script's private properties
in Google, never in this repo, which is public.

## How it decides what is open

A start time is offered when it falls inside the weekly hours, at least
`MIN_NOTICE_HOURS` ahead and no more than `MAX_DAYS_AHEAD` out, with
`BUFFER_MINUTES` clear of anything on any calendar in `BUSY_CALENDARS`, and
on a day that holds fewer than `MAX_BOOKINGS_PER_DAY` bookings from this
page. If a calendar can't be read, nothing is offered (it fails closed).
Before a booking is written the time is checked again under a lock, so two
people can't take the same slot.

## Setup (once, about 15 minutes)

Route A uses the browser only. Route B pushes from this folder with Google's
`clasp` tool and makes later edits a one-line command.

### Route A, in the browser

1. Signed in as timthomas@berkeley.edu, open <https://script.google.com> and
   choose New project. Name it "scheduler".
2. Project Settings (gear icon): tick "Show appsscript.json manifest file in
   editor".
3. In the editor, replace the contents of `appsscript.json` with
   `src/appsscript.json`, and of `Code.gs` with `src/Code.js`. Add script
   files `Config` and `Slots` and HTML files `Book`, `Admin`, and `Ui`, and
   paste each from `src/`.
4. Deploy > New deployment > type Web app. Execute as: Me. Who has access:
   Anyone. Deploy, approve the calendar permission, and copy the web app URL.
5. Back in the editor, choose the function `setup` and press Run. The
   execution log prints the admin link. Bookmark it; the key in it is the
   only thing that guards the admin page.
6. Open the admin link, paste your Zoom room link into the Zoom field, and
   save. It takes effect at once, with no new deployment.
7. In this repo, set `APP_URL` in `docs/index.html` to the web app URL from
   step 4 and push. GitHub Pages (Settings > Pages, branch `main`, folder
   `/docs`) then shows the booking page at the public address.

### Route B, with clasp

    npm install -g @google/clasp
    clasp login                      # browser sign-in as timthomas@berkeley.edu
    # turn on "Google Apps Script API" at https://script.google.com/home/usersettings
    clasp create --type webapp --title scheduler --rootDir src
    clasp push
    clasp open-script                # then steps 4 to 7 above

After a change: `clasp push`, then Deploy > Manage deployments > edit >
Version: New version. The URL stays the same.

### If Berkeley blocks "Anyone" access

Some university Google accounts can't share a web app with people outside
the university. If step 4 offers no "Anyone" choice, deploy from the
tim@cidrlab.org account instead: share the Berkeley calendar with that
account (at least free/busy), set `HOST_CALENDAR` to `tim@cidrlab.org`, and
follow the same steps there.

## Day to day

- Share <https://timathomas.github.io/scheduler/>, or add `?type=60` to open
  on the one-hour option.
- Bookings land on the host calendar with the guest invited. To cancel,
  delete the event; Google tells the guest.
- The admin page lists upcoming bookings and writes availability text.
- The same text comes from
  `…/exec?view=text&key=KEY&dates=2026-10-13,2026-10-14&minutes=30&tz=America/New_York&link=1`,
  which is what Claude's `/avail` command calls once the app is deployed.
