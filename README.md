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
  date, start/end time, location, notes).
- **Admin → Roster Match** (`/admin/roster`) — for each event, automatically lists
  which staff are available to work it, based on their weekly availability for that
  event's day of the week. Badged **full** (covers the whole event) or **partial**
  (covers only part of it).

## 1. Create the Google Sheet

1. Create a new Google Sheet (any name). It needs two tabs:
   - `Availability` (or your own name — set it in `GOOGLE_SHEET_TAB`)
   - `Events` (or your own name — set it in `GOOGLE_EVENTS_SHEET_TAB`)
2. Leave both tabs empty — the app writes its own header row on first save.
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
`No | Event Name | Date | Start Time | End Time | Location | Notes | ID`. Managed
entirely from `/admin/events`; the `ID` column is an internal key used for editing
and deleting — leave it alone if you edit the sheet directly.

**Roster Match** (`/admin/roster`) doesn't store anything — it reads both tabs live
and, for each event, converts the event's date to a day of week (in Melbourne time)
and checks each staff member's availability for that day, accounting for custom hours
and overnight ranges.
