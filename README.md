# Project Timeline

Enter task data, get a month-by-month calendar with colour blocks, export it to
Excel. Replaces drawing the same chart cell by cell in Google Sheets.

## Run

```bash
npm install
npm run dev      # http://localhost:3000
```

## How it works

The calendar is the whole page. Everything else opens in a dialog.

**Months** — one month fills the screen at a time. Scrolling snaps: it comes to
rest on a month boundary rather than halfway through one. Scroll down for later
months, up for earlier ones. The page opens on the current month, and **Today**
brings you back to it.

The range covers the work plus two months before and six after, so there is
always an empty month to scroll into and fill in. Those months draw the full
grid, with days off and public holidays already marked, before any task exists.

**Task list** — set up the names you use before placing any work: add them one
at a time, or paste a whole list, one name per line. Blank lines and repeats are
skipped. Each name can carry its own colour, otherwise the colour is still
guessed from the name.

**+ Add task** — a task needs three things: a name, a start date and an end date.
Once the task list has names in it, the name field becomes a dropdown; pick
"type a different name" for a one-off that does not belong in the list.

- The colour is picked from the name: type `CONCEPT` and it turns slate blue,
  `FEEDBACK R1` red, `REVISION STORYBOARD R1` amber. Override it in the dialog.
- Two tasks on the same dates stack into separate rows instead of overlapping.
- A task spanning several weeks wraps onto the next week's row.

Beside each month is a panel built from the task list. A name already placed
shows its dates and opens for editing; one that is not yet placed is dimmed and
reads "not scheduled" — clicking it opens Add task with the name and colour
filled in. Anything scheduled whose name is not in the list is grouped under
"Not in the list", so a task buried under days off, which has no block to click,
is still reachable. The panel needs the width, so it is hidden below 1024px.

**Click any block** on the calendar to edit or delete that task.

A task's note shows on the block itself, in italics under the name. The name is
set larger than the date numbers — it is what the calendar is read for. Notes
carry through to both exports.

**Days off**

- Sunday is off by default. Tap `Sat` to take the whole weekend.
- Vietnamese public holidays load automatically for whatever years the tasks
  cover — Tết, Hùng Kings' day, 30 Apr, 2 Sep, including the compensatory days.
  Press **Refresh** to re-fetch.
- Add company days off (team building, studio closure) by hand.
- **Make-up workdays** force a working day even on a weekend or holiday.

When a task crosses a day off, the block splits into two pieces around it but
**the task's end date does not move** — the same way the spreadsheet does it.

**Export Excel** — an `.xlsx` with three sheets: `TIMELINE` (the coloured
calendar, merged cells), `DATA` (the task table) and `DAYS OFF` (every day off
currently applied).

**Export PDF** — landscape A4, one month per page, with a task table at the end.
The font is embedded from `public/fonts/`, because PDF's built-in fonts are
Latin-1 only and would turn "Tết Nguyên Đán" into "T ¿t Nguyên â r".

A task with an invalid date range, or one that falls entirely on days off, has
nothing to draw. Rather than vanishing, it is listed in an amber bar above the
calendar; click its name to fix it.

## On a phone

The calendar fits the screen width by default so a whole month is visible —
short blocks get clipped (`KICK-…`), and tapping one tells you which task it is.
Press **Zoom in** for full labels and sideways scrolling. Pinch-zoom also works.

Dialogs open as bottom sheets. `Esc` or tapping outside closes them.

## Storing data

With nothing configured the app saves to the browser (**Local only** badge) —
lost when you switch machines, and not shareable.

To put the whole team on one link:

1. Create a project at [supabase.com](https://supabase.com)
2. Open **SQL Editor** and run [`supabase-schema.sql`](./supabase-schema.sql)
3. `cp .env.example .env.local`, then fill in `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Project Settings → API)
4. Restart `npm run dev` — the badge changes to **Shared DB**

Edits then propagate live to everyone with the page open.

For several projects at once, add `?p=<slug>` to the URL, e.g.
`localhost:3000/?p=vinamilk-tvc`. Each slug is its own timeline.

## A note on the holiday feed

Holidays come from the Google Calendar "Vietnamese Holidays" feed. It carries
Tết and Hùng Kings' day (lunar dates), which international holiday APIs miss —
`date.nager.at`, for instance, returns only the four fixed solar dates. But:

- It mixes in Christmas and Easter, which are ordinary working days in Vietnam.
  Those are filtered out and sit behind an opt-in checkbox.
- It also contains entries named **"Ngày làm việc"** — those are make-up
  *workdays*, the opposite of a day off. The app detects them, tags them
  `make-up workday`, and keeps them as working days even when they land on a
  weekend. Without that, the calendar would black out a day everyone is at work.
- Compensatory days are announced by the government each year, usually late in
  the preceding year. If next year's data is incomplete, add the days by hand
  under *Custom days off*.

If the feed is unreachable the app falls back to a built-in list of the four
fixed holidays and shows an amber warning — it never silently runs on bad data.
