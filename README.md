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

**Moving between months** — `‹` and `›` step one month at a time. A green dot on
an arrow means there is work in that direction. **Today** jumps back to the
current month; **All** drops the month filter and stacks the whole project in
one view, the way the original spreadsheet looked.

Paging to a month with nothing in it still draws the full grid, so you can set
up a new month before any task exists. `+ Add task` pre-fills dates inside the
month you are looking at, and saving a task dated into another month follows it
there rather than letting it vanish.

Export always covers the whole project, not just the month on screen.

**+ Add task** — a task needs three things: a name, a start date and an end date.

- The colour is picked from the name: type `CONCEPT` and it turns slate blue,
  `FEEDBACK R1` red, `REVISION STORYBOARD R1` amber. Override it in the dialog.
- Two tasks on the same dates stack into separate rows instead of overlapping.
- A task spanning several weeks wraps onto the next week's row.

**Click any block** on the calendar to edit or delete that task.

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
