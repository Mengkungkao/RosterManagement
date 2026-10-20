# Roster Management

A small Next.js site for rostering event staff. Staff enter their weekly availability;
admins plan events, roster people onto them within each person's hour rules, and see
each person's minimum award pay per fortnight (Hospitality Industry (General) Award,
worked out like the Fair Work pay calculator). Everything is stored in a Google Sheet —
the sheet *is* the database.

## What it does

**Staff** (no admin login needed — each person picks a password the first time):

- **Availability** (`/`) — for each weekday: Unavailable, All day, or Custom hours
  (overnight works, e.g. 22:00 to 06:00). The name is remembered on that phone.
- **My Shifts** (`/today`) — the shifts they're rostered for in the next two weeks
  (per day: hours and unpaid break), and a timeline of today's and tomorrow's events
  with the run of show.

**Admin** (`/admin`, password-protected):

- **Roster** — one pay fortnight at a time (‹ › to move). Each event shows how many
  of the staff it needs are rostered (`2/3 staff`). Click an event to add or remove
  people, change one person's times, or change how many staff it needs. Candidates
  are listed best fit first, with the reason if someone isn't free or would break
  their hour rule.
  - **Auto-fill open shifts** fills every open place from today on (see below).
  - **Clear fortnight** takes everyone off the fortnight's events from today on.
  - **Save to Roster tab** writes a printable roster to the sheet.
  - **Hours this fortnight** lists everyone's hours for week 1, week 2 and the
    fortnight, and flags anyone outside their rule.
- **Events** — add, edit and delete events: date, times, **staff needed**, **setup**
  and **pack-down** hours (staff work from setup to pack-down), location, notes, an
  optional run of show ("18:30 Entree serve"), and **"Staff can also work other
  functions at the same time"** (e.g. a Studio 1 function covered by the Great Room
  team).
- **Staff** — each person's **type** and **award level**, their availability, and a
  password reset. Add people here before they've logged in if you like. Includes a
  "who's free when" heatmap.
- **Wages** — minimum award pay per person for the fortnight, with a breakdown per pay
  item and per shift, a CSV download, and the pay settings (award rates, public
  holidays, fortnight start).

## Staff types and hour rules

| Type | Rule | What Auto-fill does |
| --- | --- | --- |
| Casual | Up to 76h per fortnight where possible | Shares shifts out evenly; only goes over 76h when no one else can work |
| Part-time | At least 8h per week | Gives them shifts first until they have 8h that week |
| Full-time | Up to 76h per fortnight | Gives them shifts next while they stay within 76h; only goes over 76h when no one else can work |
| Student | No more than 48h per fortnight (paid as casual) | Never rosters them past 48h |

Blank or unknown types count as Casual. Weeks are the two halves of the pay fortnight.

Rules for everyone:

- **Breaks:** a shift longer than 6 hours includes an unpaid 30-minute break, placed
  between 4h and 6h after the start (spread evenly), so no one works more than 6 hours
  in a row; a very long shift gets a second break. Hours everywhere are worked hours,
  after breaks.
- **12 hours a day at most:** Auto-fill never rosters anyone past 12 worked hours in a
  day. A function whose shift is longer than one person may work (12h plus the break)
  is split into equal early and late shifts, e.g. 07:00–14:00 and 14:00–21:00, each
  filled to "staff needed".
- **Functions at the same time:** normally no one is on two events whose shifts
  overlap. Tick "Staff can also work other functions at the same time" on an event to
  allow it (either event ticked is enough); that person's time is then counted once
  for hours, breaks and pay. Auto-fill uses people who aren't working at that time
  first, then shares.
- **Staffing count:** `3/4 staff` is the fewest people on at any moment of the shift,
  so early/late shifts and part-shifts count properly.

Auto-fill goes through the fortnight's events in date order and, for each open place,
picks someone who is free for the **whole** shift (or the early/late part), isn't on
an overlapping event (unless the function shares staff), stays within 12 hours that day
and within their rule. Among those: part-timers under their weekly 8h, then full-timers
under 76h, then everyone else, then — last — full-timers and casuals who would go over
76h. Within each group people not working at that time come before shared ones, then
whoever has the fewest hours this fortnight, then staff-list order. People already
rostered are kept. Events before today are left as they are (their hours still count).
If no one fits, the place stays open and Auto-fill says which events are short.

Adding someone by hand is always allowed; the panel shows why they might not fit (not
free, already on another event, would pass 48h), and the event and hours table keep a
warning until it's sorted. Someone only free for part of a shift is added with just
those hours.

## Wages (Hospitality Industry (General) Award 2020, MA000009)

Each person's minimum pay is worked out minute by minute from their rostered worked
time (unpaid breaks out, shared functions counted once), the way the Fair Work pay
calculator does, using their **award level** (Staff page) and type:

| | Full-time / part-time | Casual (and students) |
| --- | --- | --- |
| Monday–Friday | 100% | 125% (includes the 25% casual loading) |
| Mon–Fri 7pm–midnight / midnight–7am | + $2.95 / + $4.42 per hour or part of an hour | same |
| Saturday | 125% | 150% |
| Sunday | 150% | 175% |
| Public holiday | 225% | 250% |
| Overtime Mon–Fri | 150% first 2h of the day, then 200% | same |
| Overtime Sat/Sun | 200% | same |

Percentages are of the full-time/part-time hourly rate for the level, rounded to the
cent like the pay guide. Overtime starts after 11.5 worked hours in a day (12h for
casuals) or 76 hours in the fortnight. Only the highest penalty applies (no evening
loading on weekends or public holidays). Minimum paid hours: 2 for casuals each time
they come in; 4 (full/part-time) or 2 (casual) on a public holiday.

Rates are from the Fair Work Ombudsman pay guide effective 1 July 2026 (award text
clauses 11, 15, 16, 28 and 29). Rates go up every 1 July: copy the new hourly rates
from the [pay guide](https://www.fairwork.gov.au/pay-and-wages/minimum-wages/pay-guides)
into **Pay settings** on the Wages page (the page warns when a fortnight is past
30 June and the built-in rates are still in use). Add your state's public holidays
there too.

Not included: junior and apprentice rates (liquor service staff get adult rates anyway),
allowances, annualised salaries, and anything an enterprise agreement changes. It's
pay before tax and super — check anything unusual with the Fair Work pay calculator.

The pay settings also set when a **pay fortnight** starts (any date a fortnight
starts on; default Monday 5 Jan 2026). The Roster and Wages pages use it.

## Setup

### 1. Google Sheet

Create a Google Sheet and copy its ID from the URL:
`https://docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`. The app creates the
tabs it needs (`Availability`, `Events`, `Roster`, `Settings`) on first save, so the
sheet can start empty.

### 2. Google service account

1. In [Google Cloud Console](https://console.cloud.google.com/), create (or reuse) a
   project and enable the **Google Sheets API**.
2. **IAM & Admin → Service Accounts → Create service account** (no roles needed).
3. Open it → **Keys → Add key → Create new key → JSON**. You need `client_email` and
   `private_key` from the file.
4. **Share** the Google Sheet with the `client_email` as an **Editor**.

### 3. Environment variables

Copy `.env.example` to `.env.local` and fill it in:

| Variable | Value |
| --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `client_email` from the JSON key |
| `GOOGLE_PRIVATE_KEY` | `private_key` from the JSON key, in quotes with `\n` line breaks (copy it as-is) |
| `GOOGLE_SHEET_ID` | the Sheet ID from step 1 |
| `GOOGLE_SHEET_TAB` | staff/availability tab (default `Availability`) |
| `GOOGLE_EVENTS_SHEET_TAB` | events tab (default `Events`) |
| `GOOGLE_ROSTER_SHEET_TAB` | printable roster tab (default `Roster`) |
| `GOOGLE_SETTINGS_SHEET_TAB` | pay settings tab (default `Settings`) |
| `ADMIN_PASSWORD` | password for `/admin` |
| `AUTH_SECRET` | random string that signs the admin cookie — `openssl rand -hex 32` |
| `ROSTER_LOCAL_DATA` | optional: path to a JSON file to use **instead of** Google Sheets (demos and testing; created on first save) |

### 4. Run it

```bash
npm install
npm run dev                  # development, http://localhost:3000
```

For the production server, build first — `npm run start` only serves an existing build,
and fails with "Could not find a production build" without one. Build again after every
code change:

```bash
npm run build
npm run start
```

Checks: `npm test` (unit tests for the roster rules, wages and sheet reading/writing),
`npm run lint`.

### 5. Deploy to Vercel

Push to GitHub, import into [Vercel](https://vercel.com/new), add the environment
variables from step 3 (not `ROSTER_LOCAL_DATA`), and deploy.

## How data is stored

New columns are only ever added at the right-hand end, so rows written by older
versions still read correctly; their new cells start blank (defaults below).

**Availability tab** — one row per staff member:
`No | Name | Status | Monday … Sunday | Last Updated | Password | Type | Hourly Rate | Award Level`.
Day cells read `Unavailable`, `All day` or `HH:MM-HH:MM`. Names match case-insensitively.
Saving availability (or changing someone on the Staff page) rewrites only that person's
row, and new people are appended, so the sheet's row order is kept and two people
saving at once don't overwrite each other. `Password` is chosen by the person the first
time and stored in plain text (same trust model as `ADMIN_PASSWORD`); it is never sent
to the browser. Reset it from the Staff page, or clear the cell. `Type` is `Casual`,
`Part-time`, `Full-time` or `Student` (blank = Casual). `Award Level` is `Introductory`
or `Level 1`–`Level 6`. `Hourly Rate` is no longer used (pay follows the award level)
but whatever is in it is kept. To remove someone, delete their row.

**Events tab** — one row per event:
`No | Event Name | Date | Start Time | End Time | Location | Actions | Notes | ID |
Staff Needed | Setup Hours | Pack-down Hours | Rostered Staff | Share Staff`.
`Actions` holds one run-of-show step per line (`HH:MM Label` or just `Label`).
`ID` is an internal key — leave it alone. Blank `Staff Needed` / `Setup Hours` /
`Pack-down Hours` mean 1. `Rostered Staff` has one person per line: just the name to
work the event's shift (setup → pack-down), or `Name HH:MM-HH:MM` for their own times.
`Share Staff` is `Yes` when the event's staff may work other functions at the same time.
An end time at or before the start time means the event runs past midnight. Dates can
be `YYYY-MM-DD` or `D/M/YYYY`; a row whose date or times can't be read is skipped (and
left untouched in the sheet) until it's fixed. Saving rewrites the tab in date order in
a single write.

**Roster tab** — written by **Save to Roster tab** for the fortnight on screen: title,
`Name | dates… | Hours`, an `Events` row summarising each day, blank `Closing Sets` /
`Mid-shift Sets` rows to fill in by hand, then one row per person with their shift
times, event and unpaid break per day and their total worked hours. Each save replaces
the tab.

**Settings tab** — `Setting | Value` rows written from the Wages page: fortnight start
date, public holiday dates, the award hourly rate for each level, and the evening and
night loadings. Missing or unreadable values fall back to the 1 July 2026 defaults.
