# Roster Availability

A small Next.js site where staff enter their weekly availability (Monday–Sunday, 24h)
and admins plan events and see who's free to work them. Data is stored in a Google
Sheet, so there's no database to manage — the sheet *is* the database.

- **Staff view** (`/`) — enter your name, then for each day pick **Unavailable**,
  **All day**, or **Custom hours**. Custom hours support overnight ranges (e.g. 22:00
  to 06:00). Re-entering your name reloads and lets you edit your existing entry.
- **Admin → Availability** (`/admin`) — password-protected table of every staff
  member's availability for the week, read live from the sheet.
- **Admin → Events** (`/admin/events`) — add, edit, and delete planned events (name,
  date, start/end time, **staff needed**, location, notes), each with optional
  **phases** — timed milestones within the event, e.g. "18:30 Entree serve", "19:00
  Main start". Phases are just labels for a moment in time; leave the time blank to
  mean "at the start of the event". "Staff needed" is how many people the auto-roster
  tries to fill the event with (default 1).
- **Admin → Roster Match** (`/admin/roster`) — a weekly grid: days (Mon–Sun) across
  the top, hours (00:00–23:00, Melbourne time) down the side. Each event renders as
  one continuous, colour-coded block (not repeated per hour); events that overlap in
  time are placed side by side instead of stacked. Each block shows a heading (event
  name + location), its time schedule (start, each phase, end — all with times), and,
  once rostered, who's assigned to it. Click a block to open its detail panel:
  - **Rostered staff** — who's currently assigned (from the last auto-roster run).
  - **Setup / prep** — staff available in a configurable window (default 1h) before
    the event starts.
  - **During the event** — broken into segments by the event's phases (or one segment
    for the whole event if it has none), each showing who's available for that part.
  - **Closing / pack-down** — staff available in a configurable window (default 1h)
    after the event ends.

  Staff are badged **full** (available the whole segment) or **partial**.

  The **Auto-assign roster** button computes a roster for every event in one go:
  it fills each event's "staff needed" with available people (preferring full
  coverage over partial, and spreading shifts evenly across staff who are
  interchangeable), never double-books someone onto two overlapping events on the
  same weekday, and saves the result to the `Roster` sheet tab. Re-running it
  regenerates the whole week's roster from scratch.

## 1. Create the Google Sheet

1. Create a new Google Sheet (any name). It needs three tabs:
   - `Availability` (or your own name — set it in `GOOGLE_SHEET_TAB`)
   - `Events` (or your own name — set it in `GOOGLE_EVENTS_SHEET_TAB`)
   - `Roster` (or your own name — set it in `GOOGLE_ROSTER_SHEET_TAB`)
2. Leave all three tabs empty — the app writes its own header row on first save.
   The `Roster` tab is written the first time you click **Auto-assign roster**, so
   it's fine if it stays empty until then.
3. Copy the **Sheet ID** from the URL:
   `https://docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`

## 2. Create a Google service account

1. In [Google Cloud Console](https://console.cloud.google.com/), create (or reuse) a
   project, then enable the **Google Sheets API** for it.
2. Go to **IAM & Admin → Service Accounts → Create service account**. Any name is fine;
   no project-level roles are required.
3. Open the new service account → **Keys → Add key → Create new key → JSON**. This
   downloads a JSON file — you'll need the `client_email` and `private_key` fields
   from it.
4. Open your Google Sheet, click **Share**, and share it with the service account's
   `client_email` as an **Editor**.

## 3. Configure environment variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Value |
| --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | the `client_email` from the JSON key |
| `GOOGLE_PRIVATE_KEY` | the `private_key` from the JSON key, kept in quotes with `\n` line breaks (copy it as-is) |
| `GOOGLE_SHEET_ID` | the Sheet ID from step 1 |
| `GOOGLE_SHEET_TAB` | the availability tab name (default `Availability`) |
| `GOOGLE_EVENTS_SHEET_TAB` | the events tab name (default `Events`) |
| `GOOGLE_ROSTER_SHEET_TAB` | the auto-generated roster tab name (default `Roster`) |
| `ADMIN_PASSWORD` | password required to view `/admin` |
| `AUTH_SECRET` | random string used to sign the admin session cookie — generate with `openssl rand -hex 32` |

## 4. Run locally

```bash
npm install
npm run dev
```

Visit `http://localhost:3000` to submit availability, and
`http://localhost:3000/admin` for the admin dashboard (you'll be asked for
`ADMIN_PASSWORD`).

## 5. Deploy to Vercel

1. Push this repo to GitHub and import it into [Vercel](https://vercel.com/new).
2. Add the same environment variables from step 3 in the Vercel project's
   **Settings → Environment Variables**.
3. Deploy. No other configuration is needed.

## How data is stored

**Availability tab** — one row per staff member:
`No | Name | Status | Mon | Tue | Wed | Thu | Fri | Sat | Sun | Last Updated`.
Each day cell reads `Unavailable`, `All day`, or `HH:MM-HH:MM`. `Status` is an
auto-computed summary (`Fully available` / `Partially available` / `Unavailable`).
`Last Updated` is the submission time in Melbourne local time. Re-saving under the
same name (case-insensitive) replaces that person's row rather than duplicating it.

**Events tab** — one row per event:
`No | Event Name | Date | Start Time | End Time | Staff Needed | Location | Notes | Phases | ID`.
Managed entirely from `/admin/events`; the `ID` column is an internal key used for
editing and deleting — leave it alone if you edit the sheet directly. Each phase is
stored on its own line within the `Phases` cell as `HH:MM Label` (or just `Label` if
no time was set).

**Roster tab** — one row per event, written by **Auto-assign roster**:
`No | Event Name | Date | Day | Start Time | End Time | Location | Staff Needed | Assigned Staff | Status | Generated At | Event ID`.
`Assigned Staff` lists one name per line (suffixed `(partial)` if that person only
covers part of the event). `Status` is `Filled`, `Short by N`, or `Unfilled`. Every
auto-assign run fully overwrites this tab — it's a snapshot of the last run, not an
editable schedule.

The roster page itself (`/admin/roster`) computes availability live from the
Availability and Events tabs — converting each event's date to a day of week (in
Melbourne time) and matching against hours (for the grid), arbitrary windows (for the
prep/segment/closing panel), or the auto-assign algorithm, all accounting for custom
hours and overnight ranges. Because events are matched by day of week rather than
exact date, events on the same weekday in different weeks share the same grid row —
the grid represents a typical week, not a specific one.
