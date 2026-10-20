# Redesign record — October 2026

What the app was, what changed and why, how existing Google Sheets data is protected,
and what was and wasn't verified. The user guide is the [README](../README.md).

## 1. Audit of the app before the redesign (commit 6fb2d4e)

**Architecture and dependencies.** Next.js 16.4 (App Router), React 19, Tailwind 4,
`googleapis` for Sheets; Vitest. Server pages read the sheet and pass data to client
components; route handlers under `src/app/api` do the writes. All sheet access goes
through one small `TableStore` interface (`src/lib/store.ts`) with a Google Sheets
implementation and an in-memory/JSON one for tests. Rules are pure functions in
`src/lib` (`roster.ts`, `work-time.ts`, `wages.ts`, `award.ts`), shared by the pages,
the API and the tests. This structure was sound and was kept.

**Routes and workflows.** Staff: `/` availability, `/today` own shifts and a two-day
timeline. Admin: `/admin` roster by fortnight (with Auto-fill, Clear, export),
`/admin/events`, `/admin/staff`, `/admin/wages`. 74 unit tests passed; lint and type
check were clean.

**Roster and pay rules.** An event needed `Staff needed` people from setup to
pack-down; coverage was already counted as the fewest people on at any moment.
Auto-fill went through events in date order, picking people free for the whole shift,
not double-booked (unless a function shares staff), within 12 worked hours a day and
the student 48h, ranked by part-time minimum / full-time 76h / everyone else / over 76h,
then fewest hours. Breaks: unpaid 30 minutes between 4h and 6h into any stretch over
6h. Shifts over 12h + break were split into early/late parts. Wages followed MA000009
minute by minute (penalties, loadings, overtime, minimum engagement), rates from the
1 July 2026 pay guide, editable in the Settings tab.

**Gaps against the brief.**

- One undifferentiated headcount per event: no tasks, no skills, no qualifications, no
  safety requirements; anyone free could be auto-filled onto any work.
- Auto-fill saved immediately, with no draft to review, no explanation per pick, and no
  way to lock people.
- No dashboard; no draft/published state (staff saw shifts as soon as they were added);
  no time-off or change requests.

**Bugs and risks found.**

| Finding | Risk | Fixed by |
| --- | --- | --- |
| Staff passwords stored in plain text in the sheet | Anyone with sheet access sees every password | scrypt hashes; old ones convert on login or in one click |
| Admin cookie was a constant HMAC of `"admin-session"` | A copied cookie worked forever; logout and password changes didn't end it | Signed tokens with expiry, tied to the admin password |
| No limit on password guesses | Staff and admin passwords could be brute-forced | Per-name and admin lockout after 8 wrong attempts in 15 minutes |
| `serverError` logged whole error objects | Google API errors include the request, including the bearer token | Only message and status are logged |
| `/api/events/today` returned whole event records to any staff member | Every colleague's rostered times exposed | Staff get only their own shifts and events' public details |
| Read → change → write of the Events tab had no protection against concurrent saves | Two admins saving at once could silently lose one change | In-server lock per tab and a revision number per event (409 on conflict) |
| Every admin page made 3+ separate Sheets reads | Google's per-minute read quota | One `batchGet` per page |
| Manual adds were always allowed | Unsafe or unqualified assignments with only a warning | Server-side checks: safety/legal/authorisation can't be overridden; the rest need a recorded reason |

Duplicated logic was limited (the staff page's `formatMinutes` copy is harmless and
left alone). No rule was found to be wrong for its stated purpose.

## 2. What changed, ranked by business value

1. **Tasks with requirements** (`src/lib/tasks.ts`): each event lists tasks with
   headcount, times, skill and level, qualifications, physical demand, team size,
   safety controls, supervisor needs, combinability, mandatory/optional. Coverage is per
   task over time. Configurable task types in Settings.
2. **Capability profiles** (`src/lib/skills.ts`, `src/lib/profile.ts`): skills with
   level, checked-on/by and review date; qualifications with expiry; work restrictions
   (admin-only, no medical detail); preferred shifts; active/inactive; employee ID.
3. **Explainable matching and a reviewable draft** (`src/lib/roster.ts`): Stage A checks,
   Stage B ranking with reasons, most-constrained-first, team-or-nobody, controls gate,
   "why is this open" breakdowns; Generate returns a draft, Apply re-checks and saves.
   Locks and Clear unlocked.
4. **Security fixes** listed above.
5. **Draft/published events, staff requests** (time off, shift changes) and a
   **Dashboard** of things to act on.
6. **UI**: five-area navigation, event cards with task staffing, cost and warnings, a
   timeline view, a four-step event form with templates, staff profiles, Settings.

## 3. Architecture after the change

Same layers, more pure modules:

| Module | Responsibility |
| --- | --- |
| `tasks.ts`, `skills.ts`, `profile.ts`, `templates.ts` | Data types, defaults, validation, sheet cell formats |
| `roster.ts` | Task windows, coverage, Stage A checks, Stage B ranking, statuses and issues, Generate/Apply/Clear |
| `overview.ts` | What Dashboard and Roster show per event (statuses, costs, attention items) |
| `wages.ts` | Award pay (unchanged rules) plus each event's share and planned estimates |
| `events.ts`, `staff.ts`, `config-sheet.ts`, `settings-sheet.ts` | Reading and writing the tabs, with locks and revision checks |
| `passwords.ts`, `admin-auth.ts`, `rate-limit.ts`, `staff-auth.ts` | Authentication |

Roster eligibility (Stage A) and pay are separate: pay only sees the shifts that result.

Deterministic rules only — no AI service, no new runtime dependencies, no new database.
Google Sheets remains the store: the new data is small, edited rarely, and fits in a few
columns and three small tabs; nothing found needs transactions across tabs.

## 4. Data migration and backward compatibility

No migration step; nothing is rewritten on upgrade.

- **New columns at the right-hand end only.** Availability: `Employee ID, Active,
  Skills, Restrictions, Preferences, Requests`. Events: `Tasks, Status, Rev, Guests`.
  Old rows read with blank defaults (active, no skills, published, rev 0).
- **Events without tasks are saved exactly as before** (Tasks blank, `Staff Needed`,
  plain `Name` / `Name HH:MM-HH:MM` lines), so the general-staff case is unchanged.
- **New tabs** (`Task Types`, `Skills`, `Templates`) are created on first save; until
  then the built-in lists apply.
- **Unreadable cells are never overwritten**: a bad Tasks cell keeps the event row as it
  is (skipped and reported on the Dashboard); a bad Skills/Restrictions/Requests cell
  blocks changes to that field only, with a message to fix it in the sheet.
- **Passwords**: plain-text values keep working and are hashed on next login or with
  "Secure them now"; nobody's password changes.
- **Behaviour changes to know about**: new events start as drafts; adding someone by
  hand now needs a reason for soft warnings and is refused for hard ones; someone whose
  availability changed after being rostered no longer counts towards staffing until a
  reason is recorded or they're replaced (previously they counted with a warning);
  `/admin` is now the Dashboard and the roster moved to `/admin/roster`.
- **Rollback**: see the README. The previous version blanks the new Events columns on
  its first Events save, so restore them from version history if you return.
- **Your own columns**: as before, the Events tab is rewritten in one write, so don't add
  columns of your own to it.

## 5. Verification (20 Oct 2026, on the development machine)

Automated, all passing:

- `npm test` — 123 tests in 7 files: the original 74 (two adjusted only for hashed
  passwords and new column positions) plus matching, coverage, overlap, team safety,
  controls, restrictions, expiry, overrides, draft apply, locks/Clear, task storage,
  revision conflicts, moving task times, unreadable cells, password hashing, admin
  session expiry/forgery, rate limiting, write lock. Negative controls: removing the
  most-constrained ordering or the team rollback makes the corresponding tests fail.
- `npm run lint`, `npm run typecheck`, `npm run build` — clean.

Manual, against a local JSON copy (`ROSTER_LOCAL_DATA`, never the real sheet), with the
dev server and headless Chromium (Playwright):

- Dashboard, Roster (events and timeline), event panel, draft review and apply, event
  form with a template, staff profile, Settings, staff Availability and My Shifts at
  390, 820 and 1280 px wide: no page-level horizontal scroll, no browser errors.
- API: unauthenticated and forged-cookie requests refused (401); adding someone without
  RSA to a bar task refused; a soft warning refused without a reason and accepted with
  one; the same person on two non-combinable tasks at once refused; a stale revision
  refused (409); a staff member's shifts response contains no one else's names or
  manager notes; a plain-text password replaced by a hash on login; the 9th wrong
  password for a name refused (429).

**Not verified:** anything against the real Google Sheet and Sheets API (`batchGet`,
creating the new tabs, quotas); a real phone or tablet (only browser widths); Vercel
with several instances; screen readers. Pay rates and award rules were **not**
re-checked against the Fair Work pay guide in this change — the calculations are
unchanged from the 19 Oct 2026 version, whose sources are listed in `src/lib/award.ts`.

## 6. Known limitations and deliberately deferred

- **Rest between shifts** (e.g. the award's minimum break between shifts for permanent
  staff) is not checked — it needs the exact clause confirmed before it becomes a rule.
- **Travel/changeover time** between rooms isn't modelled; back-to-back tasks are
  allowed with no gap.
- **Split shifts** (a gap within a day) are paid as separate attendances; split-shift
  allowances aren't included.
- **Fairness of undesirable shifts** is only by hours (fewest hours first), not by
  counting late or weekend shifts.
- **Labour cost** isn't used to rank people beyond the contract groups (permanent staff,
  who cost less than casuals, already come first).
- **Partial-day exceptions** ("only free 14:00–18:00 on 3 Nov") — staff can only mark
  whole days off.
- **Drag-and-drop** assignment — replaced by Add / Replace buttons.
- **Per-manager accounts and an audit log** — there is one admin password; overrides
  record a reason but not who gave it (skill checks record "checked by" as typed).
- **A constraint solver** — the greedy, most-constrained-first fill was enough for the
  sizes in the brief (10–100 staff, several events a day).
