# UI/UX redesign record — October 2026

The interface was redesigned on top of the task-and-skills roster (see
[redesign-2026-10.md](redesign-2026-10.md)). Business rules, data storage and the API
are unchanged apart from the small additions listed under "Data and API". The user
guide is the [README](../README.md).

## 1. Audit of the interface before (commit fcb341b)

- **Routes:** staff `/` and `/today`; manager `/admin` (roster), `/admin/events`,
  `/admin/staff`, `/admin/wages`, `/admin/settings`, `/admin/login`.
- **Shell:** a page title, Refresh/Sign out buttons and underline tabs repeated on
  every page; the site header (Availability / My Shifts / Admin) also shown on manager
  pages; no mobile navigation pattern beyond wrapping tabs.
- **Styling:** shared Tailwind class strings (`ui.ts`) using zinc greys directly, with
  `dark:` variants repeated everywhere; no design tokens; the body font was Arial
  although Geist was loaded; status shown with colour-coded pills, some without text.
- **Components:** two different modals (roster event panel, staff profile, event
  wizard each sized their own); `window.confirm` for destructive actions; inline
  message strings for success/errors, cleared on the next action; no loading states
  between pages; no empty-state actions.
- **Workflows:** filling a vacancy meant opening a large event modal that held every
  task, candidate list and setting at once; the event form was a four-step modal
  wizard; wage reports and pay settings were on one page; there was no team
  availability view for managers; hours per person sat below the roster.
- **Responsive:** most tables relied on horizontal page scrolling; the roster grid
  stacked day cards on phones; long forms had no sticky actions.

## 2. What changed

**Design system** (`src/app/globals.css`, `src/components/ui/`): colour, surface, line,
text and status tokens defined once with light and dark values; one deep-blue primary;
green/amber/red only for status, always with an icon and words. Shared components:
`Button`/`ButtonLink`/`IconButton`, `Badge`/`CoverageBadge`, `Card`, `Field`
(`Input`, `Select`, `Textarea`, `Checkbox`, `SearchInput`, `Stepper`), `Segmented` and
`Tabs`, `Table` cells, `Alert`, `EmptyState`, `Skeleton`, `Spinner`, `Progress`,
`Dialog` and `Drawer` (focus moved in and back, Escape closes, Tab stays inside),
`Menu`, toasts and a confirmation dialog (`FeedbackProvider`), and inline line icons
(`Icon`, Lucide-style, no new dependency).

**Shell** (`src/components/shell/`, `src/app/admin/(app)/layout.tsx`): a persistent
sidebar — Dashboard, Roster, Events, Staff; Planning: Availability, Reports; Settings
at the bottom — collapsible to icons on desktop (remembered in a cookie) and a drawer
on phones and tablets; a top bar with breadcrumb, reload, alert bell and account menu;
a skip link; loading skeletons and an error screen for every manager page. Staff
pages have their own simple header (`src/app/(staff)/layout.tsx`). The layout and the
page share one Google Sheets read per request (`src/lib/data.ts`).

**Pages:**

| Page | Before | After |
| --- | --- | --- |
| Dashboard | tiles, one attention list, next 7 days | four metrics (upcoming events, unfilled positions, conflicts, planned hours with cost); today; next 14 days with staffing bars and status; Needs attention grouped by kind, each linking to the event, task or person; requests; drafts; first-run empty state |
| Roster | day-card grid, one large event modal, hours table | toolbar (fortnight ‹ › Today, week filter, search, event / staff / department filters, Events · Timeline · Staff views); expandable event rows with tasks grouped by department; a side panel per task to assign, replace, lock and see why people fit or can't; edit tasks in a side panel; staff-by-day grid with hours and rule checks; status labels |
| Events | form beside a table; wizard modal | list with Upcoming / Drafts / Past filters and search, actions menu; create and edit on their own page (`/admin/events/new`, `/admin/events/<id>`) in three sections with inline validation, a live summary and estimate, sticky actions, and a warning before leaving with unsaved changes |
| Staff | wide table with day chips | directory with search and filters (status, type, skill), desktop table / phone cards, availability dots, hours, profile flags; profile side panel in six sections with labelled records |
| Availability (new) | — | who's free on a date and time, requests waiting, approved time off, everyone's usual week, the heatmap |
| Reports (new; was Wages) | wages and pay settings | Hours, Wages and Events tabs per fortnight, each with CSV; pay settings moved to Settings; `/admin/wages` redirects |
| Settings | stacked forms | section navigation; task types grouped by department with requirement badges; each section saves on its own with undo |
| Staff availability | day rows with three buttons | weekly grid with a 24-hour bar per day, "Not set" until chosen, copy Monday to weekdays, sticky save, time-off form |
| My shifts | list and timeline | shift cards with task, instructions, run of show, change requests; loading skeleton and retry |
| Sign in | plain card | branded card with links for staff |

**Data and API** (small, for the UI): a `Manager Notes` column at the end of the staff
tab (managers only); a skill record can say `not_yet` (assessed, not yet competent),
which counts like "not verified" but is shown differently; issues carry a code so the
Dashboard can sort them; `rosterStatus` and `buildDashboard` in `src/lib/overview.ts`;
`/api/availability*` say whether someone has given their availability.

**Not changed:** roster rules, matching, wage calculations, storage format of existing
columns, permissions, API routes (only additions).

## 3. Verification (20 Oct 2026, development machine)

- `npm test`: 129 tests pass (5 new: roster status — including "names in every slot
  isn't complete" — and dashboard counts and links).
- `npm run lint`, `npm run typecheck`, `npm run build`: clean.
- Headless Chromium against a throwaway JSON copy of demo data (`ROSTER_LOCAL_DATA`,
  never the real sheet), at 390, 820 and 1366 px: every manager page, the task and
  profile side panels and the phone menu — no page-level sideways scrolling and no
  browser errors. Flows run: assign from the task panel (toast, counts update),
  Generate → review → add, the Clear confirmation, event form validation then save as
  draft (lands on the roster with the event open), saving a settings section, report
  tabs, keyboard Tab order (skip link first), staff availability save and My shifts.
  Dark mode checked on the Dashboard, Roster and task panel.

**Not verified:** the real Google Sheet; real phones and tablets (browser widths only);
screen readers; Safari and Firefox.

## 4. Known limitations

- No drag and drop on the roster (assign/replace buttons in the task panel instead).
- No global search across pages; each page has its own search.
- The alert bell links to the Dashboard's list; there are no push or email notifications.
- One shared manager password, so the account menu shows "manager", not a person.
- Opening a profile's upcoming shift leaves unsaved profile changes behind (they aren't
  saved automatically).
