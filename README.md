# Roster Management

A small Next.js site for rostering hospitality staff — banquets, restaurants, bars,
conferences and events. A manager enters an event, says what work it needs, lets the
app propose a safe roster, reviews the gaps and publishes. Staff enter their
availability and see their shifts on their phones. Everything is stored in a Google
Sheet — the sheet *is* the database.

The audit and migration notes for the October 2026 redesign are in
[docs/redesign-2026-10.md](docs/redesign-2026-10.md), and the interface redesign that
followed is recorded in [docs/ui-redesign-2026-10.md](docs/ui-redesign-2026-10.md).

## The everyday workflow

1. **Events → Create event.** One page in three parts: event details (name, date,
   venue, times, guests, notes) → staffing requirements (start from a template or blank,
   then tasks, headcounts and times) → schedule and review (run of show, staffing
   summary). A summary alongside shows positions, estimated hours and cost. Save it as
   a draft; you land on the roster with the event open.
2. **Roster → Generate roster.** The app proposes people for every open position from
   today to the end of the pay fortnight, with a reason for each, and lists what it
   couldn't fill and why. Untick anything you don't want, then add the rest. Nothing
   is saved until you do.
3. **Fill the gaps.** Click a task on the roster: a side panel shows what it needs,
   who's on it, suggested staff with why they fit, and who can't and why — assign or
   replace without leaving the page.
4. **Publish.** Drafts aren't shown to staff. Publish the event (or "Publish drafts"
   for the fortnight) and staff see their shifts, tasks and instructions.

## What's where

**Staff** (no manager login — each person picks a password the first time), built for
phones:

- **Availability** (`/`) — their usual week, one row per day with a 24-hour bar:
  Off, All day, or set hours (overnight works, e.g. 22:00 to 06:00), with "Copy Monday
  to weekdays"; and **dates they can't work** (leave, exams). Asking for days off keeps
  them off the roster for those days until the manager declines it.
- **My shifts** (`/today`) — their own published shifts for the next two weeks: times,
  task ("Soft Setup · Smith Wedding"), task instructions, event notes and run of show,
  unpaid break and hours per day; a button to ask for a change; and a timeline of
  today's and tomorrow's events. They never see anyone else's shifts or details.

**Manager** (`/admin`, password-protected). A sidebar (collapsible on desktop, a menu
on phones and tablets) and a top bar with where you are, **reload from Google
Sheets**, the **alert bell** (how many things need a decision) and the account menu.

- **Dashboard** — this fortnight's upcoming events, unfilled positions, roster
  conflicts and planned staff hours (with the estimated cost); today's events and the
  next 14 days with each event's staffing and status; **Needs attention**: roster
  conflicts, unfilled positions, availability problems, qualifications expiring or
  expired, hour limits and sheet rows that can't be read, each linking straight to the
  event, task or person; staff requests to approve or decline; drafts not yet
  published.
- **Roster** — one pay fortnight at a time (‹ ›, Today), the whole fortnight or one
  week, with filters by event, staff member and department (setup and pack-down / food
  and beverage / leadership) and a search. Three views:
  - **Events**: each event as a row with its status, times, setup and pack-down,
    venue, guests, positions filled and hours; expand it to see its tasks grouped by
    department (`Food Service 3/4` with the people on it). Click a task to fill it.
  - **Timeline**: each day on a time axis — every task's time with short stretches
    hatched and labelled, incomplete team work marked, then every person's shifts with
    task changes, breaks and overlaps (⚠). Click a bar to open its task.
  - **Staff**: staff down, days across — each person's shifts, time off and whether
    they're free, with their fortnight hours and rule checks.
  - Actions: **Generate roster**, **Publish drafts**, and under ⋯ **Clear unlocked
    assignments**, **Save to Roster tab** (a printable roster in the sheet, published
    events only) and the hours and wages report.
  - **Status** of each event, always with an icon and words: **Draft** (positions
    still open), **Ready for review** (every position filled by people who pass every
    check — publish when ready), **Published**, or **Needs attention** (a conflict,
    an unsafe or unconfirmed task, someone who can't work what they're on, or a
    published event with gaps). Names in every slot isn't enough to count as complete.
- **Events** — upcoming, drafts, past or all, with search; create, edit
  (`/admin/events/<id>`), duplicate and delete (with a confirmation naming the
  event). Editing an event's start time never moves its tasks unless you tick "Also
  move every task's times".
- **Staff** — a directory in sheet order: search by name or employee ID, filter by
  active, type and skill or qualification; each person's top skills, type and award
  level, usual week, hours this fortnight and profile flags. A person's **profile**
  (side panel) has: employment details; skills and capabilities (Not verified, Not yet
  competent, Learning, Trained, Experienced, Qualified/authorised, each with who
  checked it and when); qualifications with expiry and work restrictions; availability,
  preferences and requests; scheduled shifts and hours; manager notes; password reset.
- **Availability** — who's free on a date (and time), time-off requests to answer,
  approved time off coming up, everyone's usual week and a "who's free when" heatmap.
- **Reports** — by pay fortnight: **Hours** (week 1, week 2, fortnight, rule checks),
  **Wages** (estimated minimum award pay per person with a breakdown per pay item and
  per shift) and **Events** (positions, planned and rostered hours, estimated cost),
  each downloadable as CSV. The old `/admin/wages` links open the Wages report.
- **Settings** — task types, skills and qualifications, event templates, matching
  priorities, and pay (fortnight start, public holidays, award rates); each section
  saves on its own.

## Tasks

An event lists the work it needs as **tasks**, each with a headcount and its own
times, e.g. Hard Setup 2 (15:00–16:30), Soft Setup 2 (16:00–18:00), Food Service 4,
Barista 1, Bartender 1, Event Supervisor 1. Staffing is counted **over time**: a task
needing 4 is filled only when 4 eligible people are on at every moment of it, and one
person counts once however they're listed.

A **task type** (Settings) is a reusable template: name, group, usual time (before,
during or after the event), and requirements. Adding a task to an event copies the
type's requirements, which you can then change for that event under "Details &
requirements":

| Requirement | Effect |
| --- | --- |
| Skill and minimum level | Below the level (or not recorded, or past its review date) can't be picked by Generate. Without a minimum, anyone can do it and experienced people are ranked first. |
| Qualifications (e.g. RSA) | Must be recorded and not expired. Never overridable. |
| Physical demand | Low / moderate / heavy manual handling. Matched against work restrictions. |
| Team size | Team lifting: Generate adds a whole team or no one, and the task shows as unsafe while fewer than the team are on. |
| Safety controls | Equipment or method needed (trolleys, table lifters). Generate won't fill the task until someone ticks that the controls are arranged. |
| Needs a supervisor | Warns when no one on a supervisor/team leader task covers it. |
| Can combine | Its people may do another combinable task at the same time (e.g. Bartender and Bar Stock). Never for heavy or team work. |
| Mandatory | Optional tasks are filled after everything else and never count as gaps. |

An event saved before tasks existed (or one that only needs general staff) has a single
**Event staff** task: "Staff needed" people from setup to pack-down, exactly as before.

**Templates** save an event's whole staffing structure, with times relative to the
event's start or end, for recurring weddings, conferences and dinners. Three are built
in; save your own with "Save these tasks as a template" on the event form.

## Skills, qualifications and restrictions

Each person's **skills** are recorded once and reused by every event: Learning,
Trained, Experienced or Qualified/authorised, with the date checked, who checked it and
an optional review date. **Qualifications** (RSA, food handling, first aid, manual
handling training) are held or not, with an expiry date. Nothing recorded means *not
verified* — never assumed competent. Staff don't edit their own skills.

**Work restrictions** (admins only) hold only what rostering needs — "No heavy manual
handling until 1 Dec", "No manual handling", or a note to check — never medical
details. Nobody's suitability is inferred from anything but these task-specific
records.

## How Generate roster decides

**Stage A — checks everyone must pass.** For each open position: active; available for
the whole time (weekly availability, and no time off asked for or approved); not on
another task or event at the same time (unless both tasks can combine, or for another
event, either event shares staff); required qualifications current; required skill
verified at the level; no work restriction against the task's physical demand; no more
than 12 worked hours that day; a student no more than 48 hours in the fortnight.

**Stage B — ranking people who pass**, best first:

1. part-timers short of 8h that week, then full-timers staying within 76h, then
   everyone else, then (only if no one else can) full-timers and casuals who'd go over
   76h;
2. people not already working at that time before people shared from another function;
3. fit points (each can be switched off in Settings → Matching): experienced or
   qualified in the task's skill, prefers this kind of shift, already working this
   event just before or after;
4. fewest hours this fortnight, then staff-list order.

Every proposal comes with its reason, e.g. "Recommended: Experienced: Banquet / food
service; Available for the whole shift; 6h this fortnight, under 76h".

**Order.** Mandatory tasks before optional ones, then the most constrained first (the
fewest people who could do it compared with how many it needs — so the only barista
isn't used up on food service), then date order. A shift longer than one person may
work (12h plus the break) is split into equal early and late parts.

**What stays open.** Generate never fills a position with someone who fails a check, to
reach 100%. Each open position says why, e.g. "9 missing or expired qualification · 3
already working at that time · 1 on leave or asked for time off". People already on the
roster are never removed; events before today are left alone (their hours still
count).

**Applying a draft** re-checks every proposal against the roster as it is then, and
skips (with the reason) anything that no longer fits — so a change made by someone else
in the meantime isn't overwritten.

## Changing the roster by hand

On the roster, click a task: **Assign** (best fit first), **Replace**, change one
person's times, **Lock** (Clear keeps locked people), or take them off. People who fail a check
are listed separately with the reason:

- **Can't be rostered:** missing or expired qualification, work restriction, a skill
  below the level on heavy or team work, inactive, or already on something at the same
  time. These are refused on the server too.
- **Can be added with a reason:** not available, time off asked for or approved, a
  skill below the level on light work (e.g. a trainee shadowing), over 12 hours that
  day, over the student 48 hours (visa limits lift in course breaks). The reason is
  saved with the shift and shown on the event. Without a reason — e.g. someone whose
  availability changed after they were rostered — they're shown as a warning and
  don't count towards the task until a reason is given or they're replaced.

Someone only free for part of a task is added for just those hours.

## Staff types and hour rules

| Type | Rule | What Generate does |
| --- | --- | --- |
| Casual | Up to 76h per fortnight where possible | Shares shifts out evenly; only goes over 76h when no one else can work |
| Part-time | At least 8h per week | Gives them shifts first until they have 8h that week |
| Full-time | Up to 76h per fortnight | Gives them shifts next while they stay within 76h; only goes over 76h when no one else can work |
| Student | No more than 48h per fortnight (paid as casual) | Never rosters them past 48h |

Blank or unknown types count as Casual. Weeks are the two halves of the pay fortnight.
Inactive staff are never rostered; their history and pay records stay.

Rules for everyone:

- **Breaks:** a continuous stretch at work longer than 6 hours includes an unpaid
  30-minute break, placed between 4h and 6h after the start (spread evenly), so no one
  works more than 6 hours in a row; a very long stretch gets a second break. Back-to-back
  tasks (setup then service) are one stretch with one break. Hours everywhere are worked
  hours, after breaks.
- **12 hours a day at most** (worked hours).
- **Two things at once** is counted once for hours, breaks and pay.

## Wages (Hospitality Industry (General) Award 2020, MA000009)

Each person's minimum pay is worked out minute by minute from their rostered worked
time (unpaid breaks out, time on two things at once counted once), the way the Fair
Work pay calculator does, using their **award level** and type:

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

Each event's cost is its share of those amounts (time on two functions at once is
split between them), so the events add up to the fortnight's total. Before anyone is
rostered, an event shows a rough **planned** cost: every position paid as a Level 1
casual for its whole task.

These are **estimates of award minimums, not a payroll result.** Rates are from the
Fair Work Ombudsman pay guide effective 1 July 2026 (award clauses 11, 15, 16, 28 and
29) and go up every 1 July: copy the new hourly rates from the
[pay guide](https://www.fairwork.gov.au/pay-and-wages/minimum-wages/pay-guides) into
**Settings → Pay and award** (the Wages report warns when a fortnight is past 30 June and
the built-in rates are still in use). Add your state's public holidays there too. Not
included: junior and apprentice rates, allowances, split-shift or other rules not
listed above, annualised salaries, and anything an enterprise agreement changes. Pay is
before tax and super — check anything unusual with the Fair Work pay calculator.

## Security

- **Staff passwords** are stored as salted scrypt hashes (Node's built-in crypto).
  Passwords left in plain text by the previous version still work, are replaced by a
  hash the next time that person logs in, and can all be secured at once from the
  Staff page. They are never sent to the browser.
- **Admin sessions** are signed, expire after 7 days, are checked on the server on every
  admin page and API request, and end for everyone when the admin password or
  `AUTH_SECRET` changes. The admin password can be stored as a hash
  (`ADMIN_PASSWORD_HASH`, from `npm run hash-password`).
- **Wrong passwords** — eight in 15 minutes for one staff name (or for the admin) and
  further attempts are refused for a while. This is kept in the server's memory.
- **Staff pages** only receive the logged-in person's own shifts and requests, and
  published events' public details. Restrictions, skills, manager notes, pay and other
  people's shifts are admin-only.
- Everything sent to the server is validated there. Google API errors are logged
  without their request details, so access tokens never reach the logs.
- **Saving safely:** each change is one read and one write of the tab, made while
  holding a lock in the server, and each event has a revision number — if someone else
  changed the event since you opened it, your save is refused with "Reload to see the
  latest version" instead of overwriting theirs. Each change is saved in a single write
  of the tab or row, and a failed save says so.

## Setup

### 1. Google Sheet

Create a Google Sheet and copy its ID from the URL:
`https://docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`. The app creates the
tabs it needs on first save, so the sheet can start empty.

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
| `GOOGLE_SETTINGS_SHEET_TAB` | settings tab (default `Settings`) |
| `GOOGLE_TASK_TYPES_SHEET_TAB` / `GOOGLE_SKILLS_SHEET_TAB` / `GOOGLE_TEMPLATES_SHEET_TAB` | configuration tabs (defaults `Task Types`, `Skills`, `Templates`) |
| `ADMIN_PASSWORD_HASH` | preferred: the admin password's hash from `npm run hash-password` |
| `ADMIN_PASSWORD` | or the admin password itself (used only if there's no hash) |
| `AUTH_SECRET` | random string that signs the admin cookie — `openssl rand -hex 32` |
| `ROSTER_LOCAL_DATA` | optional: path to a JSON file to use **instead of** Google Sheets (demos and testing; created on first save) |

### 4. Run it

```bash
npm install
npm run dev                  # development, http://localhost:3000
```

For the production server, build first — `npm run start` only serves an existing build,
and fails with "Could not find a production build" without one. Build again after every
code change, and stop the running server first (the build replaces its files):

```bash
npm run build
npm run start
```

Checks (all must pass before deploying): `npm test` (rules, matching, coverage, safety,
wages, sheet reading/writing, security), `npm run lint`, `npm run typecheck`,
`npm run build`. To try changes without touching the real sheet, run with
`ROSTER_LOCAL_DATA=/some/file.json`.

### 5. Deploy

**Your own server** (e.g. the Jetson): pull, `npm install`, `npm run build`, restart
`npm run start`.

**Vercel:** push to GitHub, import into [Vercel](https://vercel.com/new), add the
environment variables from step 3 (not `ROSTER_LOCAL_DATA`), and deploy. On Vercel
several server instances may run at once: the in-server write lock and wrong-password
limit then only cover one instance each, but the events' revision numbers still catch
two people editing the same event.

### Upgrading and rolling back

Before upgrading, make a copy of the Google Sheet (**File → Make a copy**). The upgrade
needs no migration step: old rows read as before (see below), new columns are added at
the right-hand end the first time a row is saved, and the new tabs are created when
their settings are first saved.

To roll back, deploy the previous version, knowing that:

- it reads the staff tab and keeps the new staff columns (it only writes the columns it
  knows);
- **the first time it saves the Events tab it blanks the `Tasks`, `Status`, `Rev` and
  `Guests` columns** (it rewrites the tab with its own columns), so events lose their
  tasks and draft status — restore those columns from your copy or from the sheet's
  version history (**File → Version history**) if you upgrade again;
- shift lines with a task (`Ann · Food Service`) show as unknown names until you return
  to this version;
- passwords already converted to hashes don't work in it: clear those people's
  Password cells so they choose new ones.

## How data is stored

New columns are only ever added at the right-hand end, so rows written by older
versions still read correctly; their new cells start blank (defaults below). A cell
the app can't read (a broken Tasks, Skills, Restrictions or Requests cell typed by hand)
is never overwritten: the row is kept as it is and flagged until it's fixed in the
sheet.

**Availability tab** — one row per staff member:
`No | Name | Status | Monday … Sunday | Last Updated | Password | Type | Hourly Rate |
Award Level | Employee ID | Active | Skills | Restrictions | Preferences | Requests |
Manager Notes`.
Day cells read `Unavailable`, `All day` or `HH:MM-HH:MM`. Names match
case-insensitively. Saving rewrites only that person's row and new people are appended,
so the sheet's row order is kept and two people saving at once don't overwrite each
other. `Password` is a hash (`scrypt$…`), or the old plain text until converted; clear
the cell to reset it. `Type` is `Casual`, `Part-time`, `Full-time` or `Student` (blank
= Casual). `Award Level` is `Introductory` or `Level 1`–`Level 6`. `Hourly Rate` is no
longer used but kept. `Active` is blank (active) or `Inactive`. `Skills`,
`Restrictions` and `Requests` are JSON written by the app (a skill's level can also be
`not_yet` — assessed, not yet competent); `Preferences` is a list like
`Evenings, Weekends`; `Manager Notes` is free text only managers see. To remove someone, mark them inactive or delete their row.

**Events tab** — one row per event:
`No | Event Name | Date | Start Time | End Time | Location | Actions | Notes | ID |
Staff Needed | Setup Hours | Pack-down Hours | Rostered Staff | Share Staff | Tasks |
Status | Rev | Guests`.
`Actions` holds one run-of-show step per line (`HH:MM Label` or just `Label`). `ID` is
an internal key — leave it alone. `Tasks` is JSON written by the app; blank means the
event only has general staff, `Staff Needed` of them (blank = 1) from setup to
pack-down. `Rostered Staff` has one shift per line: `Name`, or `Name HH:MM-HH:MM` for
their own times, then for events with tasks ` · Task name`, and ` · locked` and
` · override: reason` when set. `Share Staff` is `Yes` when the event's staff may work
other functions at the same time. `Status` is blank (published) or `Draft`. `Rev`
counts changes (leave it alone). An end time at or before the start time means the
event runs past midnight. Dates can be `YYYY-MM-DD` or `D/M/YYYY`; a row whose date,
times or Tasks cell can't be read is skipped (and left untouched in the sheet) until
it's fixed. Saving rewrites the tab in date order in a single write.

**Roster tab** — written by **Save to Roster tab** for the fortnight on screen
(published events only): title, `Name | dates… | Hours`, an `Events` row summarising
each day, blank `Closing Sets` / `Mid-shift Sets` rows to fill in by hand, then one row
per person with their shift times, event, task and unpaid break per day and their total
worked hours. Each save replaces the tab.

**Settings tab** — `Setting | Value` rows: fortnight start date, public holiday dates,
the award hourly rate for each level, the evening and night loadings, and the three
matching switches. Missing or unreadable values fall back to the defaults.

**Task Types, Skills and Templates tabs** — one row per item, in the order shown in
Settings, created the first time each list is saved. Until then the built-in lists
apply.
