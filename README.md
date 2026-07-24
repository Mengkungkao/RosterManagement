# Roster Availability

A small Next.js site where staff enter their weekly availability (Monday–Sunday, 24h)
and admins review everyone's submissions. Data is stored in a Google Sheet, so there's
no database to manage — the sheet *is* the database.

- **Staff view** (`/`) — enter your name, then for each day pick **Unavailable**,
  **All day**, or **Custom hours**. Custom hours support overnight ranges (e.g. 22:00
  to 06:00). Re-entering your name reloads and lets you edit your existing entry.
- **Admin view** (`/admin`) — password-protected table of every staff member's
  availability for the week, read live from the sheet.

## 1. Create the Google Sheet

1. Create a new Google Sheet (any name). Rename the first tab to `Availability`
   (or pick your own name — you'll set it in `GOOGLE_SHEET_TAB`).
2. Leave it otherwise empty — the app writes its own header row on first save.
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
| `GOOGLE_SHEET_TAB` | the tab name (default `Availability`) |
| `ADMIN_PASSWORD` | password required to view `/admin` |
| `AUTH_SECRET` | random string used to sign the admin session cookie — generate with `openssl rand -hex 32` |

## 4. Run locally

```bash
npm install
npm run dev
```

Visit `http://localhost:3000` to submit availability, and
`http://localhost:3000/admin` to view submissions (you'll be asked for
`ADMIN_PASSWORD`).

## 5. Deploy to Vercel

1. Push this repo to GitHub and import it into [Vercel](https://vercel.com/new).
2. Add the same environment variables from step 3 in the Vercel project's
   **Settings → Environment Variables**.
3. Deploy. No other configuration is needed.

## How data is stored

Each save writes one row per day (7 rows per staff member) to the sheet, with columns
`Staff Name | Day | Status | Start Time | End Time | Updated At`. Re-saving under the
same name (case-insensitive) replaces that person's previous rows rather than
duplicating them, so the sheet always reflects the latest submission per staff member.
