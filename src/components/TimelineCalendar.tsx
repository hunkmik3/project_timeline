'use client';

import { Fragment, useMemo, useRef, useState } from 'react';
import type { MonthBlock } from '@/lib/calendar';
import type { ISODate, TaskCategory, TaskPreset } from '@/lib/types';
import MonthTaskPanel from './MonthTaskPanel';
import { WEEKDAY_HEADERS, addDays, daysBetween, formatDate } from '@/lib/date';

interface Props {
  blocks: MonthBlock[];
  categories: TaskCategory[];
  /** Names from Task list, shown in each month's panel. */
  library: TaskPreset[];
  title: string;
  /** Every task currently picked out — one from a click, more via Alt-click. */
  selectedIds: string[];
  onSelectTask: (id: string) => void;
  onToggleSelect: (id: string) => void;
  /** Shift the given tasks by a whole number of days. */
  onMoveTasks: (ids: string[], deltaDays: number) => void;
  onClearSelection: () => void;
  /** Passing a preset pre-fills the new task with that name and colour. */
  onAddTask: (preset?: TaskPreset) => void;
  /** Clicking or dragging across empty cells picks the dates for a new task. */
  onAddRange: (start: ISODate, end: ISODate) => void;
  /** Mobile: squeeze all 7 columns to the screen width instead of scrolling. */
  fitWidth: boolean;
}

const CELL = 'border border-neutral-300 text-center dark:border-neutral-700';

/**
 * One month per screen. `h-full` resolves against <main>, which owns the scroll,
 * and `snap-start` is what makes the scroll come to rest on a month boundary
 * rather than halfway through one.
 */
const SECTION =
  'flex h-full snap-start items-center justify-center px-2 py-[clamp(0.5rem,1.5svh,1rem)] sm:px-4 lg:px-0';

/** Holds the month's task list and the calendar side by side, within one width
 *  so the pair stays centred instead of the calendar drifting off-axis. */
// 90% of the viewport on desktop; on a phone the padding alone is the margin,
// since the calendar needs every pixel of width it can get.
const ROW = 'mx-auto flex h-[88%] max-h-full w-full gap-2 sm:gap-3 lg:w-[90%]';

/**
 * Below lg there is no room beside the calendar, and stacking the list under it
 * would push the month past one screen and break snapping. Tapping a block is
 * the way in on a phone.
 */
const SIDEBAR =
  'hidden w-52 shrink-0 flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white p-2.5 shadow-sm lg:flex xl:w-64 dark:border-neutral-800 dark:bg-[#151518]';

const CARD =
  'flex h-full min-w-0 flex-1 flex-col overflow-x-auto rounded-lg border border-neutral-200 bg-white p-[clamp(0.6rem,1.8svh,1.25rem)] shadow-sm dark:border-neutral-800 dark:bg-[#151518]';

/**
 * Every row of the month — the weekday header, each week's dates and each lane
 * under it — shares one grid so the fractions stretch to fill the screen. A
 * month with five weeks and a month with six both end up exactly one screen
 * tall, which is what keeps snapping honest. The floors stop a busy month from
 * squeezing rows into illegibility; past that the card scrolls instead.
 *
 * Lane rows get the larger share: they carry the task name and, under it, the
 * note — the content people actually read — while the date rows only hold a
 * number.
 */
const HEADER_ROW = 'minmax(0.9rem, 0.9fr)';
const DATE_ROW = 'minmax(0.85rem, 0.85fr)';
const LANE_ROW = 'minmax(1rem, 1.35fr)';

export default function TimelineCalendar({
  blocks,
  categories,
  library,
  title,
  selectedIds,
  onSelectTask,
  onToggleSelect,
  onMoveTasks,
  onClearSelection,
  onAddTask,
  onAddRange,
  fitWidth,
}: Props) {
  /** Live drag selection; both ends are dates, in whatever order they were drawn. */
  const [drag, setDrag] = useState<{ from: ISODate; to: ISODate } | null>(null);
  /** A touch that did not move is a tap on one day — touch must not hijack scrolling. */
  const tap = useRef<{ date: ISODate; x: number; y: number } | null>(null);

  /**
   * Walks everything under the cursor, not just the topmost element: while a
   * block is being dragged it sits over the cells, and the date lives on the
   * cell underneath it.
   */
  const dateAt = (x: number, y: number): ISODate | null => {
    for (const el of document.elementsFromPoint(x, y)) {
      const date = (el as HTMLElement).closest?.('[data-date]')?.getAttribute('data-date');
      if (date) return date;
    }
    return null;
  };

  const taskById = useMemo(
    () => new Map(blocks.flatMap((b) => b.tasks.map((t) => [t.id, t] as const))),
    [blocks],
  );

  /** A block being dragged to a new date: which tasks, and by how many days. */
  const [move, setMove] = useState<{ ids: string[]; grabbed: ISODate; delta: number } | null>(null);
  /** Set on drop so the click that follows a drag does not also open the task. */
  const movedRef = useRef(false);

  const selected = new Set(selectedIds);

  const blockHandlers = (taskId: string) => ({
    'data-block': true,
    onPointerDown: (e: React.PointerEvent) => {
      // Cleared first, before any early return: preventDefault below can swallow
      // the click entirely, and a stale flag would eat the next genuine one.
      movedRef.current = false;
      // Touch keeps its tap-to-open; claiming the drag would cost scrolling.
      if (e.pointerType !== 'mouse' || e.button !== 0 || e.altKey) return;
      const grabbed = dateAt(e.clientX, e.clientY);
      if (!grabbed) return;
      e.preventDefault();
      e.stopPropagation();
      const ids = selected.has(taskId) ? [...selected] : [taskId];
      setMove({ ids, grabbed, delta: 0 });
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!move) return;
      const over = dateAt(e.clientX, e.clientY);
      if (!over) return;
      const delta = daysBetween(move.grabbed, over);
      if (delta !== move.delta) setMove({ ...move, delta });
    },
    onPointerUp: (e: React.PointerEvent) => {
      if (!move) return;
      e.stopPropagation();
      const { ids, delta } = move;
      setMove(null);
      if (delta !== 0) {
        movedRef.current = true;
        onMoveTasks(ids, delta);
      }
    },
    onPointerCancel: () => setMove(null),
    onClick: (e: React.MouseEvent) => {
      // The drag already did the work; the trailing click must not reopen it.
      if (movedRef.current) {
        movedRef.current = false;
        return;
      }
      if (e.altKey) {
        e.preventDefault();
        onToggleSelect(taskId);
        return;
      }
      onSelectTask(taskId);
    },
  });

  /** Where the dragged tasks would land — drawn on the cells as they move. */
  const moveTarget = (date: ISODate | null) => {
    if (!date || !move || move.delta === 0) return false;
    return move.ids.some((id) => {
      const t = taskById.get(id);
      if (!t) return false;
      return date >= addDays(t.start, move.delta) && date <= addDays(t.end, move.delta);
    });
  };

  const commit = (from: ISODate, to: ISODate) =>
    onAddRange(from <= to ? from : to, from <= to ? to : from);

  const gridHandlers = {
    onPointerDown: (e: React.PointerEvent) => {
      const date = (e.target as HTMLElement).closest('[data-date]')?.getAttribute('data-date');
      if (!date) return;
      if (e.pointerType !== 'mouse') {
        tap.current = { date, x: e.clientX, y: e.clientY };
        return;
      }
      if (e.button !== 0) return;
      onClearSelection();
      // Stops the drag from selecting the date numbers as text.
      e.preventDefault();
      setDrag({ from: date, to: date });
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!drag) return;
      const date = dateAt(e.clientX, e.clientY);
      if (date && date !== drag.to) setDrag({ ...drag, to: date });
    },
    onPointerUp: (e: React.PointerEvent) => {
      if (drag) {
        const { from, to } = drag;
        setDrag(null);
        commit(from, to);
        return;
      }
      const start = tap.current;
      tap.current = null;
      // Anything past a few pixels was a scroll, not a tap.
      if (!start) return;
      if (Math.abs(e.clientX - start.x) > 8 || Math.abs(e.clientY - start.y) > 8) return;
      commit(start.date, start.date);
    },
    onPointerCancel: () => {
      setDrag(null);
      tap.current = null;
    },
  };

  const inDrag = (date: ISODate | null) => {
    if (!date || !drag) return false;
    const lo = drag.from <= drag.to ? drag.from : drag.to;
    const hi = drag.from <= drag.to ? drag.to : drag.from;
    return date >= lo && date <= hi;
  };

  // Fitting the width leaves ~50px per column on a phone, so the type shrinks too.
  // The task name outranks the date number: it is what the calendar is for.
  const dayText = fitWidth
    ? 'text-[10px] sm:text-[clamp(0.6rem,1.45svh,0.85rem)]'
    : 'text-[11px] sm:text-[clamp(0.6rem,1.45svh,0.85rem)]';
  const nameText = fitWidth
    ? 'text-[10px] sm:text-[clamp(0.7rem,1.85svh,1.05rem)]'
    : 'text-[12px] sm:text-[clamp(0.7rem,1.85svh,1.05rem)]';
  const noteText = fitWidth
    ? 'text-[8px] sm:text-[clamp(0.55rem,1.35svh,0.8rem)]'
    : 'text-[10px] sm:text-[clamp(0.55rem,1.35svh,0.8rem)]';
  const headText = fitWidth
    ? 'text-[10px] sm:text-[clamp(0.66rem,1.65svh,0.9rem)]'
    : 'text-[13px] sm:text-[clamp(0.66rem,1.65svh,0.9rem)]';

  if (blocks.length === 0) {
    return (
      <section className={SECTION}>
        <div className={`${ROW} ${CARD} items-center justify-center text-center`}>
          <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
            No tasks yet. Add one and the calendar builds itself.
          </p>
          <button
            type="button"
            onClick={() => onAddTask()}
            className="rounded bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
          >
            + Add task
          </button>
        </div>
      </section>
    );
  }

  return (
    <>
      {blocks.map((block, index) => {
        // Row 1 is the weekday header; each week then takes a dates row followed
        // by one row per lane. Absolute indices let every cell live in one grid.
        let cursor = 1;
        const rowSizes = [HEADER_ROW];
        const weekRows = block.weeks.map((week) => {
          const dateRow = cursor + 1;
          const laneStart = dateRow + 1;
          cursor = laneStart + week.laneCount - 1;
          rowSizes.push(DATE_ROW, ...Array<string>(week.laneCount).fill(LANE_ROW));
          return { week, dateRow, laneStart };
        });

        return (
          <section key={block.key} id={`m-${block.key}`} className={SECTION}>
            <div className={ROW}>
              <aside className={SIDEBAR}>
                <MonthTaskPanel
                  library={library}
                  tasks={block.tasks}
                  categories={categories}
                  selectedIds={selectedIds}
                  onSelectTask={onSelectTask}
                  onToggleSelect={onToggleSelect}
                  onAddNamed={onAddTask}
                />
              </aside>

              <div className={CARD}>
              {/* Zoomed mode sets a min width so block labels stay readable and
                  the card scrolls sideways. Desktop is always wide enough. */}
              <div
                className={`flex min-h-0 flex-1 flex-col ${
                  fitWidth ? '' : 'min-w-[680px]'
                } lg:min-w-0`}
              >
                {/* The sheet banner belongs at the very top, not above every month. */}
                {index === 0 && (
                  <div className="mb-2 inline-block self-start bg-[#00FF00] px-3 py-1 text-sm font-bold text-black">
                    {title}
                  </div>
                )}

                <h2 className="mb-[clamp(0.35rem,1.2svh,1rem)] shrink-0 text-center text-[clamp(1.05rem,3.4svh,2rem)] font-bold tracking-wide text-neutral-900 dark:text-neutral-100">
                  {block.label}
                </h2>

                <div
                  className="grid min-h-0 flex-1 touch-pan-y grid-cols-7 select-none"
                  style={{ gridTemplateRows: rowSizes.join(' ') }}
                  {...gridHandlers}
                >
                  {WEEKDAY_HEADERS.map((label, i) => (
                    <div
                      key={label}
                      className={`${CELL} ${headText} flex items-center justify-center font-medium ${
                        i === 6 ? 'bg-[#1F4E5A] text-white' : 'bg-[#00FFFF] text-black'
                      }`}
                      style={{ gridColumn: i + 1, gridRow: 1 }}
                    >
                      {label}
                    </div>
                  ))}

                  {weekRows.map(({ week, dateRow, laneStart }) => (
                    <Fragment key={week.key}>
                      {week.days.map((day, i) => (
                        <div
                          key={`d${i}`}
                          data-date={day.date ?? undefined}
                          className={`${CELL} ${dayText} flex items-center justify-center ${
                            day.date ? 'cursor-cell' : ''
                          } ${
                            day.date && day.isOff
                              ? 'bg-[#1F4E5A] text-white'
                              : 'text-neutral-800 dark:text-neutral-300'
                          } ${day.isToday ? 'font-bold ring-1 ring-inset ring-blue-500' : ''} ${
                            inDrag(day.date) || moveTarget(day.date)
                              ? 'ring-2 ring-inset ring-blue-500'
                              : ''
                          }`}
                          style={{ gridColumn: i + 1, gridRow: dateRow }}
                          title={day.offLabel}
                        >
                          {day.day ?? ''}
                        </div>
                      ))}

                      {/* Lane backgrounds, drawn before the blocks that sit on top. */}
                      {Array.from({ length: week.laneCount }, (_, lane) =>
                        week.days.map((day, i) => (
                          <div
                            key={`l${lane}-${i}`}
                            data-date={day.date ?? undefined}
                            className={`${CELL} ${day.date ? 'cursor-cell' : ''} ${
                              day.date && day.isOff ? 'bg-[#1F4E5A]' : ''
                            } ${inDrag(day.date) || moveTarget(day.date) ? 'ring-2 ring-inset ring-blue-500' : ''}`}
                            style={{ gridColumn: i + 1, gridRow: laneStart + lane }}
                          />
                        )),
                      )}

                      {week.placed.flatMap((p) =>
                        p.segments.map((seg, si) => (
                          <button
                            type="button"
                            key={`${p.task.id}-${si}`}
                            {...blockHandlers(p.task.id)}
                            title={`${p.task.name} · ${formatDate(p.task.start)} → ${formatDate(p.task.end)}\nDrag to move · Alt-click to add to selection`}
                            className={`flex cursor-grab flex-col items-center justify-center overflow-hidden border border-neutral-300 px-0.5 leading-tight select-none active:cursor-grabbing sm:px-1 dark:border-neutral-700 ${
                              selected.has(p.task.id) ? 'ring-2 ring-inset ring-blue-600' : ''
                            } ${move?.ids.includes(p.task.id) ? 'opacity-50' : ''}`}
                            style={{
                              gridColumn: `${seg.startCol + 1} / ${seg.endCol + 2}`,
                              gridRow: laneStart + p.lane,
                              backgroundColor: p.color,
                              color: p.textColor,
                            }}
                          >
                            {/* Wraps to a second line instead of cutting off.
                                overflow-wrap:anywhere is what breaks a long
                                unspaced name — break-words alone leaves it
                                overflowing the cell. */}
                            <span
                              className={`line-clamp-2 w-full font-bold [overflow-wrap:anywhere] ${nameText}`}
                            >
                              {p.task.name}
                            </span>
                            {p.task.note && (
                              <span className={`w-full truncate italic opacity-80 ${noteText}`}>
                                {p.task.note}
                              </span>
                            )}
                          </button>
                        )),
                      )}
                    </Fragment>
                  ))}
                </div>
              </div>
              </div>
            </div>
          </section>
        );
      })}
    </>
  );
}
